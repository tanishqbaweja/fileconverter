import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const startedAt = performance.now();
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourcePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "legacy-video-source.avi",
);
const sourceManifestPath = `${sourcePath}.json`;
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const fixturePath = path.join(fixtureRoot, "mpeg4-mp3-avi-copy-128m.mkv");
const manifestPath = `${fixturePath}.json`;
const minimumBytes = 128 * 1024 * 1024;
const minimumFreeBytes = 512 * 1024 * 1024;
const durationSeconds = 65;
const frameRate = 24;
const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));

await assertProtectedSource();
await mkdir(fixtureRoot, { recursive: true });
const volume = await statfs(fixtureRoot);
const freeBytes = Number(volume.bavail) * Number(volume.bsize);
if (freeBytes < minimumFreeBytes) {
  throw new Error(
    `AVI-output stress generation needs at least ${minimumFreeBytes} free bytes; ${freeBytes} are available.`,
  );
}

try {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-stream_loop",
      "-1",
      "-i",
      sourcePath,
      "-t",
      String(durationSeconds),
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-vf",
      "scale=1282:536,setsar=1,noise=alls=12:allf=t+u",
      "-c:v",
      "mpeg4",
      "-q:v",
      "3",
      "-c:a",
      "copy",
      "-map_metadata",
      "0",
      "-metadata:s:a:0",
      "language=eng",
      "-fflags",
      "+bitexact",
      "-f",
      "matroska",
      fixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );

  const fixtureStat = await stat(fixturePath);
  if (fixtureStat.size < minimumBytes) {
    throw new Error(
      `Generated Matroska fixture is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`,
    );
  }
  const [probe, videoPacketSha256, audioPacketSha256, maximumPacketBytes] =
    await Promise.all([
      probeFile(fixturePath),
      packetHash(fixturePath, "0:v:0"),
      packetHash(fixturePath, "0:a:0"),
      largestPacket(fixturePath),
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
    !String(probe.format?.format_name ?? "")
      .split(",")
      .includes("matroska") ||
    video?.codec_name !== "mpeg4" ||
    video?.width !== 1282 ||
    video?.height !== 536 ||
    !Number.isFinite(decodedVideoFrames) ||
    decodedVideoFrames < 1_500 ||
    !Number.isFinite(decodedVideoDurationSeconds) ||
    Math.abs(decodedVideoDurationSeconds - durationSeconds) > 1 ||
    audio?.codec_name !== "mp3" ||
    audio?.tags?.language !== "eng" ||
    (probe.chapters?.length ?? 0) !== 0 ||
    maximumPacketBytes < 1
  ) {
    throw new Error(
      "Generated stress fixture is not the expected MPEG-4 Part 2/MP3 Matroska source.",
    );
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-compatible-avi-stress-fixture.mjs",
        source: "fixtures/media/legacy-video-source.avi",
        sourceSha256: sourceManifest.sha256,
        durationSeconds,
        frameRate,
        decodedVideoFrames,
        decodedVideoDurationSeconds,
        videoPacketSha256,
        videoPacketCount: Number(video.nb_read_packets),
        audioPacketSha256,
        audioPacketCount: Number(audio.nb_read_packets),
        maximumPacketBytes,
        bytes: fixtureStat.size,
        sha256: await hashFile(fixturePath),
        generationSeconds: Number(
          ((performance.now() - startedAt) / 1000).toFixed(2),
        ),
        probe,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await assertProtectedSource();
  process.stdout.write(
    `${fixturePath}\nGenerated MPEG-4 Part 2/MP3 Matroska stress source in ${((performance.now() - startedAt) / 1000).toFixed(2)} seconds.\n`,
  );
} catch (error) {
  await rm(fixturePath, { force: true });
  await rm(manifestPath, { force: true });
  await assertProtectedSource();
  throw error;
}

async function assertProtectedSource() {
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

async function probeFile(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-count_frames",
      "-count_packets",
      "-show_format",
      "-show_streams",
      "-show_chapters",
      "-of",
      "json",
      filePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function packetHash(filePath, map) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-xerror",
      "-i",
      filePath,
      "-map",
      map,
      "-c",
      "copy",
      "-f",
      "hash",
      "-hash",
      "sha256",
      "-",
    ],
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
  return Math.max(
    ...stdout.trim().split(/\r?\n/).map(Number).filter(Number.isFinite),
  );
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
