import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "fixtures", "media", "mobile-video-source.3gp");
const sourceManifest = JSON.parse(await readFile(`${sourcePath}.json`, "utf8"));
const fixtureRoot = path.join(projectRoot, "fixtures", "media");
const fixturePath = path.join(fixtureRoot, "h264-video-source.h264");

await assertSource();
await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", sourcePath, "-map", "0:v:0", "-c:v", "copy",
    "-bsf:v", "h264_mp4toannexb", "-fflags", "+bitexact",
    "-f", "h264", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
const video = probe.streams.find((stream) => stream.codec_type === "video");
const [frameRateNumerator, frameRateDenominator] = String(video?.avg_frame_rate)
  .split("/").map(Number);
const decodedVideoFrames = Number(video?.nb_read_frames);
const durationSeconds = decodedVideoFrames * frameRateDenominator / frameRateNumerator;
if (
  probe.format?.format_name !== "h264" ||
  probe.streams.length !== 1 ||
  video?.codec_name !== "h264" ||
  video?.width !== 640 ||
  video?.height !== 360 ||
  decodedVideoFrames !== 96 ||
  !Number.isFinite(durationSeconds)
) {
  throw new Error("Generated fixture is not the expected 640x360 H.264 elementary stream.");
}
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-h264-fixture.mjs",
    source: "fixtures/media/mobile-video-source.3gp",
    sourceSha256: sourceManifest.sha256,
    durationSeconds,
    decodedVideoFrames,
    bytes: fixtureStat.size,
    sha256: await hashFile(fixturePath),
    probe,
  }, null, 2)}\n`,
  "utf8",
);
await assertSource();
process.stdout.write(`${fixturePath}\n`);

async function assertSource() {
  const sourceStat = await stat(sourcePath);
  if (sourceStat.size !== sourceManifest.bytes) {
    throw new Error(`Verified 3GP source size changed: ${sourceStat.size}.`);
  }
  const sha256 = await hashFile(sourcePath);
  if (sha256 !== sourceManifest.sha256) {
    throw new Error(`Verified 3GP source SHA-256 changed: ${sha256}.`);
  }
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath, { highWaterMark: 1024 * 1024 })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
