import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const startedAt = performance.now();
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const videoSourcePath = path.join(projectRoot, "fixtures", "media", "mpeg2-video-source.m2v");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const fixturePath = path.join(fixtureRoot, "mpeg2-mp3-avi-copy-192m.mkv");
const manifestPath = `${fixturePath}.json`;
const minimumBytes = 192 * 1024 * 1024;
const maximumBytes = 250 * 1024 * 1024;
const minimumFreeBytes = 2 * 1024 * 1024 * 1024;
const durationSeconds = 720;
const frameRate = 24;

await mkdir(fixtureRoot, { recursive: true });
const volume = await statfs(fixtureRoot);
const freeBytes = Number(volume.bavail) * Number(volume.bsize);
if (freeBytes < minimumFreeBytes) {
  throw new Error(
    `MPEG-2 AVI stress generation needs at least ${minimumFreeBytes} free bytes; ${freeBytes} are available.`,
  );
}

try {
  const videoSourceManifest = JSON.parse(
    await readFile(`${videoSourcePath}.json`, "utf8"),
  );
  await assertFileIdentity(videoSourcePath, videoSourceManifest);
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-fflags", "+genpts+bitexact",
      "-stream_loop", "-1", "-r", String(frameRate), "-i", videoSourcePath,
      "-f", "lavfi", "-i", `sine=frequency=440:sample_rate=48000:duration=${durationSeconds}`,
      "-t", String(durationSeconds),
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "libmp3lame", "-b:a", "192k",
      "-map_metadata", "-1", "-fflags", "+bitexact",
      "-f", "matroska", fixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );

  const fixtureStat = await stat(fixturePath);
  if (fixtureStat.size < minimumBytes || fixtureStat.size > maximumBytes) {
    throw new Error(
      `Generated Matroska fixture is ${fixtureStat.size} bytes; expected ${minimumBytes}-${maximumBytes}.`,
    );
  }
  const [probe, videoPacketSha256, audioPacketSha256, maximumPacketBytes, sha256] =
    await Promise.all([
      probeFile(fixturePath),
      packetHash(fixturePath, "0:v:0"),
      packetHash(fixturePath, "0:a:0"),
      largestPacket(fixturePath),
      hashFile(fixturePath),
    ]);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const decodedVideoFrames = Number(video?.nb_read_frames);
  const [rateNumerator, rateDenominator] = String(video?.avg_frame_rate)
    .split("/")
    .map(Number);
  const decodedVideoDurationSeconds =
    (decodedVideoFrames * rateDenominator) / rateNumerator;
  if (
    !String(probe.format?.format_name ?? "").split(",").includes("matroska") ||
    video?.codec_name !== "mpeg2video" ||
    audio?.codec_name !== "mp3" ||
    !Number.isFinite(decodedVideoFrames) ||
    decodedVideoFrames < 15_000 ||
    !Number.isFinite(decodedVideoDurationSeconds) ||
    Math.abs(decodedVideoDurationSeconds - durationSeconds) > 5 ||
    maximumPacketBytes < 1
  ) {
    throw new Error("Generated stress fixture is not the expected MPEG-2/MP3 Matroska source.");
  }
  const generationSeconds = Number(((performance.now() - startedAt) / 1000).toFixed(2));
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      generatedBy: "scripts/generate-mpeg2-avi-stress-fixture.mjs",
      videoSource: "fixtures/media/mpeg2-video-source.m2v",
      videoSourceSha256: videoSourceManifest.sha256,
      audioSource: "deterministic 440 Hz lavfi sine",
      durationSeconds,
      frameRate,
      generationSeconds,
      decodedVideoFrames,
      decodedVideoDurationSeconds,
      videoPacketSha256,
      videoPacketCount: Number(video.nb_read_packets),
      audioPacketSha256,
      audioPacketCount: Number(audio.nb_read_packets),
      maximumPacketBytes,
      bytes: fixtureStat.size,
      sha256,
      probe,
    }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${fixturePath}\nGenerated MPEG-2/MP3 AVI stress source in ${generationSeconds.toFixed(2)} seconds.\n`);
} catch (error) {
  await Promise.all([rm(fixturePath, { force: true }), rm(manifestPath, { force: true })]);
  throw error;
}

async function assertFileIdentity(filePath, manifest) {
  const fileStat = await stat(filePath);
  if (fileStat.size !== manifest.bytes || (await hashFile(filePath)) !== manifest.sha256) {
    throw new Error(`Protected source identity changed: ${filePath}`);
  }
}

async function probeFile(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-count_frames", "-count_packets", "-show_format", "-show_streams", "-of", "json", filePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function packetHash(filePath, map) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-xerror", "-i", filePath, "-map", map, "-c", "copy", "-f", "hash", "-hash", "sha256", "-"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const value = stdout.trim().match(/^SHA256=([0-9a-f]{64})$/i)?.[1];
  if (!value) throw new Error(`Packet hash is unavailable for ${map}.`);
  return value.toLowerCase();
}

async function largestPacket(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_entries", "packet=size", "-of", "csv=p=0", filePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  return Math.max(...stdout.trim().split(/\r?\n/).map(Number).filter(Number.isFinite));
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
