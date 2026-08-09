import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "fixtures", "media", "mpeg4-video-source.m4v");
const durationSeconds = 4;
const frameRate = 24;

await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-f", "lavfi", "-i", `testsrc2=size=640x360:rate=${frameRate}:duration=${durationSeconds}`,
    "-map", "0:v:0", "-c:v", "mpeg4", "-q:v", "3", "-g", "48", "-bf", "2",
    "-fflags", "+bitexact", "-f", "m4v", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);

const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
const video = probe.streams.find((stream) => stream.codec_type === "video");
const decodedVideoFrames = Number(video?.nb_read_frames);
if (
  probe.format?.format_name !== "m4v" ||
  probe.streams.length !== 1 ||
  video?.codec_name !== "mpeg4" ||
  video?.has_b_frames !== 1 ||
  video?.pix_fmt !== "yuv420p" ||
  decodedVideoFrames !== durationSeconds * frameRate
) {
  throw new Error("Generated fixture is not the expected B-frame MPEG-4 Part 2 elementary video.");
}
const fixtureStat = await stat(fixturePath);
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-m4v-video-fixture.mjs",
    durationSeconds,
    frameRate,
    decodedVideoFrames,
    decodedVideoDurationSeconds: decodedVideoFrames / frameRate,
    bytes: fixtureStat.size,
    sha256: await hashFile(fixturePath),
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath, {
    highWaterMark: 4 * 1024 * 1024,
  })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
