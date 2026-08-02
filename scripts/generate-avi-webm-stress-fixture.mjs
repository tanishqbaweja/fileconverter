import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "fixtures", "media", "legacy-video-source.avi");
const sourceManifestPath = `${sourcePath}.json`;
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const fixturePath = path.join(fixtureRoot, "mpeg4-mp3-webm-128m.avi");
const fixtureManifestPath = `${fixturePath}.json`;
const minimumBytes = 128 * 1024 * 1024;
const durationSeconds = 65;

const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
await assertSource();
await mkdir(fixtureRoot, { recursive: true });

try {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-stream_loop", "-1", "-i", sourcePath, "-t", String(durationSeconds),
      "-map", "0:v:0", "-map", "0:a:0",
      "-vf", "scale=1282:536,setsar=1,noise=alls=12:allf=t+u",
      "-c:v", "mpeg4", "-q:v", "3", "-c:a", "copy",
      "-map_metadata", "0", "-fflags", "+bitexact", "-f", "avi", fixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );

  const fixtureStat = await stat(fixturePath);
  if (fixtureStat.size < minimumBytes) {
    throw new Error(
      `Generated AVI is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`,
    );
  }
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-of", "json", fixturePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const probe = JSON.parse(stdout);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  if (
    !probe.format?.format_name?.split(",").includes("avi") ||
    video?.codec_name !== "mpeg4" ||
    video.width !== 1282 ||
    video.height !== 536 ||
    audio?.codec_name !== "mp3"
  ) {
    throw new Error("Generated stress fixture is not 1282x536 MPEG-4 Part 2/MP3 AVI.");
  }
  const decodedVideoFrames = Number(video.nb_read_frames);
  const [frameRateNumerator, frameRateDenominator] = String(
    video.avg_frame_rate,
  ).split("/").map(Number);
  const decodedVideoDurationSeconds =
    (decodedVideoFrames * frameRateDenominator) / frameRateNumerator;
  if (!Number.isFinite(decodedVideoDurationSeconds)) {
    throw new Error("Could not derive the decoded MPEG-4 video duration.");
  }
  await writeFile(
    fixtureManifestPath,
    `${JSON.stringify({
      generatedBy: "scripts/generate-avi-webm-stress-fixture.mjs",
      source: "fixtures/media/legacy-video-source.avi",
      sourceSha256: sourceManifest.sha256,
      durationSeconds,
      decodedVideoDurationSeconds,
      bytes: fixtureStat.size,
      sha256: await hashFile(fixturePath),
      probe,
    }, null, 2)}\n`,
    "utf8",
  );
  await assertSource();
  process.stdout.write(`${fixturePath}\n`);
} catch (error) {
  await rm(fixturePath, { force: true });
  await rm(fixtureManifestPath, { force: true });
  await assertSource();
  throw error;
}

async function assertSource() {
  const sourceStat = await stat(sourcePath);
  if (sourceStat.size !== sourceManifest.bytes) {
    throw new Error(
      `Verified AVI source size changed: ${sourceStat.size}; expected ${sourceManifest.bytes}.`,
    );
  }
  const sha256 = await hashFile(sourcePath);
  if (sha256 !== sourceManifest.sha256) {
    throw new Error(`Verified AVI source SHA-256 changed: ${sha256}.`);
  }
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
