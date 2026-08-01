import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "media");
const fixturePath = path.join(fixtureRoot, "mpeg2-video-source.m2v");
const durationSeconds = 4;
const frameRate = 24;

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-f", "lavfi", "-i", `testsrc2=size=640x360:rate=${frameRate}:duration=${durationSeconds}`,
    "-an", "-c:v", "mpeg2video", "-b:v", "2M",
    "-g", "12", "-bf", "2", "-pix_fmt", "yuv420p", "-threads:v", "1",
    "-flags:v", "+bitexact", "-fflags", "+bitexact",
    "-f", "mpeg2video", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
const hash = createHash("sha256");
for await (const chunk of createReadStream(fixturePath, {
  highWaterMark: 1024 * 1024,
})) {
  hash.update(chunk);
}
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
const video = probe.streams.find((stream) => stream.codec_type === "video");
if (
  probe.format?.format_name !== "mpegvideo" ||
  probe.streams.length !== 1 ||
  video?.codec_name !== "mpeg2video" ||
  video?.pix_fmt !== "yuv420p" ||
  Number(video?.nb_read_frames) !== durationSeconds * frameRate
) {
  throw new Error("Generated fixture is not the expected 640x360 MPEG-2 elementary video.");
}
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-mpeg2-video-fixture.mjs",
    durationSeconds,
    frameRate,
    bytes: fixtureStat.size,
    sha256: hash.digest("hex"),
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
