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
const fixtureSpecs = [
  ["mkv", "mpeg4-mp3-avi-copy-128m.mkv", "matroska", "matroska", true],
  ["mp4", "mpeg4-mp3-avi-copy-128m.mp4", "mp4", "mov", true],
  ["mov", "mpeg4-mp3-avi-copy-128m.mov", "mov", "mov", true],
  ["3gp", "mpeg4-avi-copy-128m.3gp", "3gp", "mov", false],
  ["mpeg-ts", "mpeg4-mp3-avi-copy-128m.mpegts", "mpegts", "mpegts", true],
].map(([sourceContainer, name, muxer, probeFormat, hasAudio]) => ({
  sourceContainer,
  name,
  muxer,
  probeFormat,
  hasAudio,
  fixturePath: path.join(fixtureRoot, name),
  manifestPath: path.join(fixtureRoot, `${name}.json`),
}));
const minimumBytes = 128 * 1024 * 1024;
const minimumFreeBytes = 2 * 1024 * 1024 * 1024;
const durationSeconds = 600;
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
  await settleAllOrThrow(
    fixtureSpecs.map((spec) =>
      execFileAsync(
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
          ...(spec.hasAudio ? ["-map", "0:a:0"] : ["-an"]),
          "-c",
          "copy",
          "-map_metadata",
          "0",
          ...(spec.hasAudio ? ["-metadata:s:a:0", "language=eng"] : []),
          "-fflags",
          "+bitexact",
          "-f",
          spec.muxer,
          spec.fixturePath,
        ],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      ),
    ),
  );

  const results = await settleAllOrThrow(fixtureSpecs.map(inspectFixture));
  const generationSeconds = Number(
    ((performance.now() - startedAt) / 1000).toFixed(2),
  );
  await Promise.all(
    results.map(({ spec, ...manifest }) =>
      writeFile(
        spec.manifestPath,
        `${JSON.stringify(
          {
            generatedBy: "scripts/generate-compatible-avi-stress-fixture.mjs",
            source: "fixtures/media/legacy-video-source.avi",
            sourceSha256: sourceManifest.sha256,
            sourceContainer: spec.sourceContainer,
            durationSeconds,
            frameRate,
            generationSeconds,
            ...manifest,
          },
          null,
          2,
        )}\n`,
        "utf8",
      ),
    ),
  );
  await assertProtectedSource();
  process.stdout.write(
    `${results.map(({ spec }) => spec.fixturePath).join("\n")}\nGenerated five compatible AVI stress sources in ${generationSeconds.toFixed(2)} seconds.\n`,
  );
} catch (error) {
  await Promise.all(
    fixtureSpecs.flatMap((spec) => [
      rm(spec.fixturePath, { force: true }),
      rm(spec.manifestPath, { force: true }),
    ]),
  );
  await assertProtectedSource();
  throw error;
}

async function inspectFixture(spec) {
  const fixtureStat = await stat(spec.fixturePath);
  if (fixtureStat.size < minimumBytes) {
    throw new Error(
      `Generated ${spec.sourceContainer} fixture is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`,
    );
  }
  const [
    probe,
    videoPacketSha256,
    audioPacketSha256,
    maximumPacketBytes,
    sha256,
  ] = await Promise.all([
    probeFile(spec.fixturePath),
    packetHash(spec.fixturePath, "0:v:0"),
    spec.hasAudio ? packetHash(spec.fixturePath, "0:a:0") : undefined,
    largestPacket(spec.fixturePath),
    hashFile(spec.fixturePath),
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
      .includes(spec.probeFormat) ||
    video?.codec_name !== "mpeg4" ||
    video?.width !== 640 ||
    video?.height !== 360 ||
    !Number.isFinite(decodedVideoFrames) ||
    decodedVideoFrames < 1_500 ||
    !Number.isFinite(decodedVideoDurationSeconds) ||
    Math.abs(decodedVideoDurationSeconds - durationSeconds) > 10 ||
    (spec.hasAudio
      ? audio?.codec_name !== "mp3"
      : probe.streams.some((stream) => stream.codec_type === "audio")) ||
    (probe.chapters?.length ?? 0) !== 0 ||
    maximumPacketBytes < 1
  ) {
    throw new Error(
      `Generated stress fixture is not the expected compatible ${spec.sourceContainer} source.`,
    );
  }
  return {
    spec,
    decodedVideoFrames,
    decodedVideoDurationSeconds,
    videoPacketSha256,
    videoPacketCount: Number(video.nb_read_packets),
    ...(spec.hasAudio
      ? {
          audioPacketSha256,
          audioPacketCount: Number(audio.nb_read_packets),
        }
      : {}),
    maximumPacketBytes,
    bytes: fixtureStat.size,
    sha256,
    probe,
  };
}

async function settleAllOrThrow(promises) {
  const settled = await Promise.allSettled(promises);
  const failure = settled.find((result) => result.status === "rejected");
  if (failure) throw failure.reason;
  return settled.map((result) => result.value);
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
    ...stdout
      .trim()
      .split(/\r?\n/)
      .map((line) => Number(line.split(",", 1)[0]))
      .filter(Number.isFinite),
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
