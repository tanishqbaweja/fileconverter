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
  "mpeg-ts": path.join(fixtureRoot, "h264-mp3-128m.mpegts"),
  flv: path.join(fixtureRoot, "h264-mp3-128m.flv"),
};
const manifestBackups = new Map();

for (const fixturePath of Object.values(fixtures)) {
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
      "-b:v", "24M", "-minrate", "24M", "-maxrate", "24M", "-bufsize", "12M",
      "-x264-params", "nal-hrd=cbr:force-cfr=1", "-pix_fmt", "yuv420p", "-g", "48",
      "-c:a", "libmp3lame", "-b:a", "192k", "-metadata:s:a:0", "language=eng",
      "-disposition:a:0", "default", "-f", "matroska", fixtures.mkv,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );

  await Promise.all(
    Object.entries(fixtures)
      .filter(([input]) => input !== "mkv")
      .map(([input, fixturePath]) =>
        execFileAsync(
          "ffmpeg",
          [
            "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
            "-i", fixtures.mkv, "-map", "0:v:0", "-map", "0:a:0",
            "-map_metadata", "0", "-c", "copy",
            ...(input === "avi" ? ["-bsf:v", "h264_mp4toannexb"] : []),
            "-f", input === "mpeg-ts" ? "mpegts" : input, fixturePath,
          ],
          { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
        ),
      ),
  );

  const referencePacketSha256 = await packetHash(fixtures.mkv);
  const decodedAudioSha256 = await decodedHash(fixtures.mkv);
  for (const [input, fixturePath] of Object.entries(fixtures)) {
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
    await writeFile(
      `${fixturePath}.json`,
      `${JSON.stringify({
        generatedBy: "scripts/generate-container-mp3-stress-fixtures.mjs",
        input,
        durationSeconds,
        frameRate,
        mp3PacketSha256,
        decodedAudioSha256,
        bytes: fixtureStat.size,
        sha256,
        generationSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
        probe,
      }, null, 2)}\n`,
      "utf8",
    );
  }
  process.stdout.write(
    `${Object.values(fixtures).join("\n")}\nGenerated six H.264/MP3 stress containers in ${((performance.now() - startedAt) / 1000).toFixed(2)} seconds.\n`,
  );
} catch (error) {
  for (const fixturePath of Object.values(fixtures)) {
    await rm(fixturePath, { force: true });
    const manifestPath = `${fixturePath}.json`;
    const backup = manifestBackups.get(manifestPath);
    if (backup === null) {
      await rm(manifestPath, { force: true });
    } else {
      await writeFile(manifestPath, backup, "utf8");
    }
  }
  throw error;
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
