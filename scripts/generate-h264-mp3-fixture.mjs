import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "fixtures", "media", "h264-mp3-source.mkv");
const durationSeconds = 4;
const frameRate = 24;

await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-f", "lavfi", "-i", `testsrc2=size=640x360:rate=${frameRate}:duration=${durationSeconds}`,
    "-f", "lavfi", "-i", `sine=frequency=997:sample_rate=48000:duration=${durationSeconds}`,
    "-map", "0:v:0", "-map", "1:a:0", "-map_metadata", "-1",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "libmp3lame", "-b:a", "192k", "-metadata:s:a:0", "language=eng",
    "-disposition:a:0", "default", "-f", "matroska", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);

const [probe, mp3PacketSha256] = await Promise.all([
  probeFile(fixturePath),
  packetHash(fixturePath),
]);
const video = probe.streams.find((stream) => stream.codec_type === "video");
const audio = probe.streams.find((stream) => stream.codec_type === "audio");
if (
  !probe.format?.format_name?.includes("matroska") ||
  probe.streams.length !== 2 ||
  video?.codec_name !== "h264" ||
  video?.width !== 640 ||
  video?.height !== 360 ||
  Number(video?.nb_read_frames) !== durationSeconds * frameRate ||
  audio?.codec_name !== "mp3" ||
  audio?.sample_rate !== "48000" ||
  audio?.channels !== 1 ||
  audio?.tags?.language !== "eng"
) {
  throw new Error("Generated fixture is not the expected H.264/MP3 Matroska source.");
}
const fixtureStat = await stat(fixturePath);
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-h264-mp3-fixture.mjs",
    durationSeconds,
    frameRate,
    mp3PacketSha256,
    bytes: fixtureStat.size,
    sha256: await hashFile(fixturePath),
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);

async function probeFile(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-of", "json", filePath],
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
  if (!value) throw new Error("MP3 packet hash is unavailable.");
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
