import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "vp8-opus-source.webm",
);
const manifestPath = `${fixturePath}.json`;
const durationSeconds = 2;
const frameRate = 24;

try {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-f", "lavfi", "-i", `testsrc2=size=320x180:rate=${frameRate}:duration=${durationSeconds}`,
      "-f", "lavfi", "-i", `sine=frequency=659:sample_rate=48000:duration=${durationSeconds}`,
      "-map", "0:v:0", "-map", "1:a:0", "-map_metadata", "-1",
      "-fflags", "+bitexact", "-flags:v", "+bitexact", "-flags:a", "+bitexact",
      "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8",
      "-b:v", "500k", "-g", "48", "-pix_fmt", "yuv420p",
      "-c:a", "libopus", "-b:a", "64k", "-metadata:s:a:0", "language=eng",
      "-f", "webm", fixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );

  const [probe, decodedVideoSha256] = await Promise.all([
    probeFile(fixturePath),
    decodedHash(fixturePath),
  ]);
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  const decodedVideoFrames = Number(video?.nb_read_frames);
  if (
    !probe.format?.format_name?.includes("webm") ||
    video?.codec_name !== "vp8" ||
    video?.width !== 320 ||
    video?.height !== 180 ||
    decodedVideoFrames !== durationSeconds * frameRate ||
    audio?.codec_name !== "opus" ||
    audio?.sample_rate !== "48000" ||
    audio?.channels !== 1 ||
    audio?.tags?.language !== "eng"
  ) {
    throw new Error("Generated fixture is not the expected VP8/Opus WebM source.");
  }

  const fixtureStat = await stat(fixturePath);
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      generatedBy: "scripts/generate-vp8-opus-fixture.mjs",
      durationSeconds,
      frameRate,
      decodedVideoFrames,
      decodedVideoSha256,
      bytes: fixtureStat.size,
      sha256: await hashFile(fixturePath),
      probe,
    }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${fixturePath}\n`);
} catch (error) {
  await Promise.all([
    rm(fixturePath, { force: true }),
    rm(manifestPath, { force: true }),
  ]);
  throw error;
}

async function probeFile(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error", "-count_frames", "-show_format", "-show_streams",
      "-of", "json", filePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function decodedHash(filePath) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-v", "error", "-xerror", "-i", filePath, "-map", "0:v:0",
      "-pix_fmt", "yuv420p", "-f", "hash", "-hash", "sha256", "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const value = stdout.trim().match(/^SHA256=([0-9a-f]{64})$/i)?.[1];
  if (!value) throw new Error("Decoded VP8 hash is unavailable.");
  return value.toLowerCase();
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath, {
    highWaterMark: 256 * 1024,
  })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
