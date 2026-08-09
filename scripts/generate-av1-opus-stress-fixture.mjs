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
const fixturePath = path.join(fixtureRoot, "av1-opus-128m.mkv");
const manifestPath = `${fixturePath}.json`;
const retainedManifest = await readFile(manifestPath, "utf8").catch((error) => {
  if (error?.code === "ENOENT") return null;
  throw error;
});
const minimumBytes = 128 * 1024 * 1024;
const durationSeconds = 60;
const frameRate = 24;

try {
  await mkdir(fixtureRoot, { recursive: true });
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-f", "lavfi", "-i", `testsrc2=size=1920x1080:rate=${frameRate}:duration=${durationSeconds}`,
      "-f", "lavfi", "-i", `sine=frequency=997:sample_rate=48000:duration=${durationSeconds}`,
      "-map", "0:v:0", "-map", "1:a:0", "-map_metadata", "-1",
      "-c:v", "libaom-av1", "-usage", "realtime", "-cpu-used", "8",
      "-b:v", "30M", "-minrate", "30M", "-maxrate", "30M", "-bufsize", "15M",
      "-row-mt", "1", "-tiles", "2x2", "-g", "48", "-pix_fmt", "yuv420p",
      "-c:a", "libopus", "-b:a", "96k", "-metadata:s:a:0", "language=eng",
      "-disposition:a:0", "default", "-f", "matroska", fixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const fixtureStat = await stat(fixturePath);
  if (fixtureStat.size < minimumBytes) {
    throw new Error(`Generated AV1 fixture is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`);
  }
  const [probe, decodedVideoSha256, decodedAudioSha256, audioPacketSha256] = await Promise.all([
    probeFile(fixturePath),
    decodedHash(fixturePath, "0:v:0"),
    decodedHash(fixturePath, "0:a:0"),
    packetHash(fixturePath),
  ]);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const decodedVideoFrames = Number(video?.nb_read_frames);
  if (
    video?.codec_name !== "av1" ||
    video?.width !== 1920 ||
    video?.height !== 1080 ||
    decodedVideoFrames !== durationSeconds * frameRate ||
    audio?.codec_name !== "opus" ||
    audio?.tags?.language !== "eng"
  ) {
    throw new Error("Generated stress fixture is not the expected AV1/Opus Matroska source.");
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      generatedBy: "scripts/generate-av1-opus-stress-fixture.mjs",
      durationSeconds,
      frameRate,
      decodedVideoFrames,
      decodedVideoDurationSeconds: decodedVideoFrames / frameRate,
      decodedVideoSha256,
      decodedAudioSha256,
      audioPacketSha256,
      audioPacketCount: Number(audio?.nb_read_packets),
      bytes: fixtureStat.size,
      sha256: await hashFile(fixturePath),
      generationSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
      probe,
    }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `${fixturePath}\nGenerated AV1/Opus stress source in ${((performance.now() - startedAt) / 1000).toFixed(2)} seconds.\n`,
  );
} catch (error) {
  await rm(fixturePath, { force: true });
  if (retainedManifest === null) {
    await rm(manifestPath, { force: true });
  } else {
    await writeFile(manifestPath, retainedManifest, "utf8");
  }
  throw error;
}

async function probeFile(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-count_frames", "-count_packets", "-show_format", "-show_streams", "-of", "json", filePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function packetHash(filePath) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-xerror", "-i", filePath, "-map", "0:a:0", "-c", "copy", "-f", "hash", "-hash", "sha256", "-"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const value = stdout.trim().match(/^SHA256=([0-9a-f]{64})$/i)?.[1];
  if (!value) throw new Error("Opus packet hash is unavailable.");
  return value.toLowerCase();
}

async function decodedHash(filePath, map) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-xerror", "-i", filePath, "-map", map, "-f", "hash", "-hash", "sha256", "-"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const value = stdout.trim().match(/^SHA256=([0-9a-f]{64})$/i)?.[1];
  if (!value) throw new Error(`Decoded hash is unavailable for ${map}.`);
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
