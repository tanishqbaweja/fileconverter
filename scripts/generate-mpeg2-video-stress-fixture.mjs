import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "fixtures", "media", "mpeg2-video-source.m2v");
const sourceManifestPath = `${sourcePath}.json`;
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const fixturePath = path.join(fixtureRoot, "mpeg2-video-128m.m2v");
const minimumBytes = 128 * 1024 * 1024;

await execFileAsync("node", ["scripts/generate-mpeg2-video-fixture.mjs"], {
  cwd: projectRoot,
  windowsHide: true,
  maxBuffer: 8 * 1024 * 1024,
});
const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
const totalSourceCopies = Math.ceil(minimumBytes / sourceManifest.bytes) + 1;
const additionalLoops = totalSourceCopies - 1;
const durationSeconds = sourceManifest.durationSeconds * totalSourceCopies;
const expectedFrames =
  sourceManifest.durationSeconds * sourceManifest.frameRate * totalSourceCopies;

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-stream_loop", String(additionalLoops), "-i", sourcePath,
    "-map", "0:v:0", "-c:v", "copy", "-fflags", "+bitexact",
    "-f", "mpeg2video", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
if (fixtureStat.size < minimumBytes) {
  throw new Error(`Generated M2V is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`);
}
const hash = createHash("sha256");
for await (const chunk of createReadStream(fixturePath, {
  highWaterMark: 4 * 1024 * 1024,
})) {
  hash.update(chunk);
}
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
const video = probe.streams.find((stream) => stream.codec_type === "video");
const [rateNumerator, rateDenominator] = String(video?.avg_frame_rate)
  .split("/").map(Number);
const decodedVideoFrames = Number(video?.nb_read_frames);
const decodedVideoDurationSeconds =
  decodedVideoFrames * rateDenominator / rateNumerator;
if (
  probe.format?.format_name !== "mpegvideo" ||
  probe.streams.length !== 1 ||
  video?.codec_name !== "mpeg2video" ||
  decodedVideoFrames !== expectedFrames ||
  !Number.isFinite(decodedVideoDurationSeconds)
) {
  throw new Error("Generated stress fixture is not the expected MPEG-2 elementary stream.");
}
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-mpeg2-video-stress-fixture.mjs",
    source: "fixtures/media/mpeg2-video-source.m2v",
    sourceSha256: sourceManifest.sha256,
    totalSourceCopies,
    durationSeconds,
    frameRate: sourceManifest.frameRate,
    decodedVideoFrames,
    decodedVideoDurationSeconds,
    bytes: fixtureStat.size,
    sha256: hash.digest("hex"),
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
