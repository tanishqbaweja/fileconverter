import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const startedAt = performance.now();
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const minimumBytes = 128 * 1024 * 1024;
const durationSeconds = 60;
const frameRate = 24;
const fixtures = {
  mkv: path.join(fixtureRoot, "h264-mp3-128m.mkv"),
  mp4: path.join(fixtureRoot, "h264-mp3-128m.mp4"),
  mov: path.join(fixtureRoot, "h264-mp3-128m.mov"),
  avi: path.join(fixtureRoot, "h264-mp3-128m.avi"),
  "avi-flv": path.join(fixtureRoot, "h264-mp3-flv-128m.avi"),
  "mpeg-ts": path.join(fixtureRoot, "h264-mp3-128m.mpegts"),
  flv: path.join(fixtureRoot, "h264-mp3-128m.flv"),
};
const requestedNames = process.argv.slice(2);
const fixtureEntries = Object.entries(fixtures);
const defaultFixtureEntries = fixtureEntries.filter(([input]) => input !== "avi-flv");
const selectedEntries = requestedNames.length
  ? fixtureEntries.filter(([, fixturePath]) =>
      requestedNames.includes(path.basename(fixturePath)),
    )
  : defaultFixtureEntries;
if (
  requestedNames.length &&
  (selectedEntries.length !== new Set(requestedNames).size ||
    requestedNames.some(
      (name) => !fixtureEntries.some(([, fixturePath]) => path.basename(fixturePath) === name),
    ))
) {
  throw new Error(
    `Choose only supported fixture names: ${fixtureEntries
      .map(([, fixturePath]) => path.basename(fixturePath))
      .join(", ")}.`,
  );
}
const manifestBackups = new Map();
const minimalAviFlvFixture =
  selectedEntries.length === 1 && selectedEntries[0][0] === "avi-flv";
const videoBitRate = minimalAviFlvFixture ? "19M" : "24M";
const videoBufferSize = minimalAviFlvFixture ? "10M" : "12M";

for (const fixturePath of new Set([
  fixtures.mkv,
  ...selectedEntries.map(([, selectedPath]) => selectedPath),
])) {
  const manifestPath = `${fixturePath}.json`;
  manifestBackups.set(
    manifestPath,
    await readFile(manifestPath, "utf8").catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    }),
  );
}

try {
  await mkdir(fixtureRoot, { recursive: true });
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-f", "lavfi", "-i", `testsrc2=size=1280x720:rate=${frameRate}:duration=${durationSeconds}`,
      "-f", "lavfi", "-i", `sine=frequency=997:sample_rate=48000:duration=${durationSeconds}`,
      "-map", "0:v:0", "-map", "1:a:0", "-map_metadata", "-1",
      "-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency",
      "-b:v", videoBitRate, "-minrate", videoBitRate, "-maxrate", videoBitRate, "-bufsize", videoBufferSize,
      "-x264-params", "nal-hrd=cbr:force-cfr=1", "-pix_fmt", "yuv420p", "-g", "48",
      "-c:a", "libmp3lame", "-b:a", "192k", "-metadata:s:a:0", "language=eng",
      "-disposition:a:0", "default", "-f", "matroska", fixtures.mkv,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );

  await Promise.all(
    selectedEntries
      .filter(([input]) => input !== "mkv")
      .map(([input, fixturePath]) =>
        execFileAsync(
          "ffmpeg",
          [
            "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
            "-i", fixtures.mkv, "-map", "0:v:0", "-map", "0:a:0",
            "-map_metadata", "0", "-c", "copy",
            ...(input === "avi" || input === "avi-flv"
              ? ["-bsf:v", "h264_mp4toannexb"]
              : []),
            "-f", input === "mpeg-ts" ? "mpegts" : input === "avi-flv" ? "avi" : input, fixturePath,
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
        ),
      ),
  );

  const referencePacketSha256 = await packetHash(fixtures.mkv);
  const decodedAudioSha256 = await decodedHash(fixtures.mkv);
  for (const [input, fixturePath] of selectedEntries) {
    const [fixtureStat, probe, mp3PacketSha256, sha256] = await Promise.all([
      stat(fixturePath),
      probeFile(fixturePath),
      packetHash(fixturePath),
      hashFile(fixturePath),
    ]);
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    const audio = probe.streams.find((stream) => stream.codec_type === "audio");
    if (
      fixtureStat.size < minimumBytes ||
      video?.codec_name !== "h264" ||
      audio?.codec_name !== "mp3" ||
      mp3PacketSha256 !== referencePacketSha256
    ) {
      throw new Error(`${input} stress fixture failed its H.264/MP3 validation.`);
    }
    const manifestPath = `${fixturePath}.json`;
    const generatedManifest = {
        generatedBy: "scripts/generate-container-mp3-stress-fixtures.mjs",
        input: input === "avi-flv" ? "avi" : input,
        durationSeconds,
        frameRate,
        mp3PacketSha256,
        decodedAudioSha256,
        bytes: fixtureStat.size,
        sha256,
        generationSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
        probe,
      };
    const priorManifestText = manifestBackups.get(manifestPath);
    const priorManifest = priorManifestText ? JSON.parse(priorManifestText) : null;
    if (!manifestsMatchExceptTiming(priorManifest, generatedManifest)) {
      await writeFile(
        manifestPath,
        `${JSON.stringify(generatedManifest, null, 2)}\n`,
        "utf8",
      );
    }
  }
  if (!selectedEntries.some(([input]) => input === "mkv")) {
    await rm(fixtures.mkv, { force: true });
  }
  process.stdout.write(
    `${selectedEntries.map(([, fixturePath]) => fixturePath).join("\n")}\nGenerated ${selectedEntries.length} H.264/MP3 stress container${selectedEntries.length === 1 ? "" : "s"} in ${((performance.now() - startedAt) / 1000).toFixed(2)} seconds.\n`,
  );
} catch (error) {
  const touchedPaths = new Set([
    fixtures.mkv,
    ...selectedEntries.map(([, fixturePath]) => fixturePath),
  ]);
  for (const fixturePath of touchedPaths) {
    await rm(fixturePath, { force: true });
    const manifestPath = `${fixturePath}.json`;
    const backup = manifestBackups.get(manifestPath);
    if (backup === null || backup === undefined) {
      await rm(manifestPath, { force: true });
    } else {
      const current = await readFile(manifestPath, "utf8").catch(() => null);
      if (current !== backup) await writeFile(manifestPath, backup, "utf8");
    }
  }
  throw error;
}

function manifestsMatchExceptTiming(left, right) {
  if (!left || !right) return false;
  const normalizedLeft = { ...left, generationSeconds: 0 };
  const normalizedRight = { ...right, generationSeconds: 0 };
  return JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight);
}

async function probeFile(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", filePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function packetHash(filePath) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-i", filePath, "-map", "0:a:0", "-c", "copy", "-f", "hash", "-hash", "sha256", "-"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const value = stdout.trim().match(/^SHA256=([0-9a-f]{64})$/i)?.[1];
  if (!value) throw new Error(`MP3 packet hash is unavailable for ${filePath}.`);
  return value.toLowerCase();
}

async function decodedHash(filePath) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-xerror", "-i", filePath, "-map", "0:a:0", "-f", "hash", "-hash", "sha256", "-"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const value = stdout.trim().match(/^SHA256=([0-9a-f]{64})$/i)?.[1];
  if (!value) throw new Error("Decoded MP3 hash is unavailable.");
  return value.toLowerCase();
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath, {
    highWaterMark: 4 * 1024 * 1024,
  })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
