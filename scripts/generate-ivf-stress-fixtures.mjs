import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, statfs, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const mkvPath = path.join(fixtureRoot, "compatible-vp9-opus-128m.mkv");
const webmPath = path.join(fixtureRoot, "compatible-vp9-opus-128m.webm");
const ivfPath = path.join(fixtureRoot, "compatible-vp9-128m.ivf");
const verificationPath = path.join(
  fixtureRoot,
  "compatible-vp9-opus-128m.verify.webm",
);
const ivfVerificationPath = path.join(
  fixtureRoot,
  "compatible-vp9-128m.verify.ivf",
);
const minimumBytes = 128 * 1024 * 1024;
const minimumFreeBytes = 1024 * 1024 * 1024;

await mkdir(fixtureRoot, { recursive: true });
const volume = await statfs(fixtureRoot);
const availableBytes = Number(volume.bavail) * Number(volume.bsize);
if (availableBytes < minimumFreeBytes) {
  throw new Error(
    `IVF stress fixture generation needs at least ${minimumFreeBytes} free bytes; ${availableBytes} are available.`,
  );
}

try {
  await execFileAsync(
    process.execPath,
    ["scripts/generate-compatible-webm-stress-fixture.mjs"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const baseManifest = JSON.parse(await readFile(`${mkvPath}.json`, "utf8"));
  const mkvManifest = await inspectFixture(mkvPath, baseManifest);
  await writeFile(
    `${mkvPath}.json`,
    `${JSON.stringify(mkvManifest, null, 2)}\n`,
    "utf8",
  );

  await remuxWebm(mkvPath, webmPath);
  await remuxWebm(mkvPath, verificationPath);
  const [webmHash, verificationHash] = await Promise.all([
    hashFile(webmPath),
    hashFile(verificationPath),
  ]);
  if (webmHash !== verificationHash) {
    throw new Error(
      "Bitexact VP9/Opus WebM fixture generation was not repeatable.",
    );
  }
  const webmManifest = await inspectFixture(webmPath, mkvManifest);
  if (webmManifest.videoPacketSha256 !== mkvManifest.videoPacketSha256) {
    throw new Error("WebM remux changed the compressed VP9 packets.");
  }
  if (webmManifest.decodedVideoSha256 !== mkvManifest.decodedVideoSha256) {
    throw new Error("WebM remux changed the decoded VP9 video.");
  }
  await writeFile(
    `${webmPath}.json`,
    `${JSON.stringify(webmManifest, null, 2)}\n`,
    "utf8",
  );
  await remuxIvf(webmPath, ivfPath);
  await remuxIvf(webmPath, ivfVerificationPath);
  const [ivfHash, ivfVerificationHash] = await Promise.all([
    hashFile(ivfPath),
    hashFile(ivfVerificationPath),
  ]);
  if (ivfHash !== ivfVerificationHash) {
    throw new Error("Bitexact VP9 IVF fixture generation was not repeatable.");
  }
  const ivfManifest = await inspectIvfFixture(ivfPath, webmManifest);
  await writeFile(
    `${ivfPath}.json`,
    `${JSON.stringify(ivfManifest, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `${mkvPath}\n${webmPath}\n${ivfPath}\nGenerated deterministic IVF extraction and input stress sources; ${availableBytes} bytes were free at preflight.\n`,
  );
} catch (error) {
  await Promise.allSettled([
    rm(mkvPath, { force: true }),
    rm(`${mkvPath}.json`, { force: true }),
    rm(webmPath, { force: true }),
    rm(`${webmPath}.json`, { force: true }),
    rm(ivfPath, { force: true }),
    rm(`${ivfPath}.json`, { force: true }),
    rm(verificationPath, { force: true }),
    rm(ivfVerificationPath, { force: true }),
  ]);
  throw error;
} finally {
  await rm(verificationPath, { force: true });
  await rm(ivfVerificationPath, { force: true });
}

async function remuxWebm(inputPath, outputPath) {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0",
      "-map_metadata",
      "-1",
      "-metadata:s:a:0",
      "language=eng",
      "-c",
      "copy",
      "-fflags",
      "+bitexact",
      "-f",
      "webm",
      outputPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
}

async function remuxIvf(inputPath, outputPath) {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-i",
      inputPath,
      "-map",
      "0:v:0",
      "-c:v",
      "copy",
      "-an",
      "-map_metadata",
      "-1",
      "-fflags",
      "+bitexact",
      "-f",
      "ivf",
      outputPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
}

async function inspectIvfFixture(filePath, reference) {
  const [file, sha256, probe, videoPackets, videoPacketSha256, decodedVideoSha256] =
    await Promise.all([
      stat(filePath),
      hashFile(filePath),
      probeFile(filePath),
      packetStats(filePath),
      packetHash(filePath, "0:v:0"),
      decodedVideoHash(filePath),
    ]);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  if (
    file.size < minimumBytes ||
    !probe.format?.format_name?.split(",").includes("ivf") ||
    probe.streams.length !== 1 ||
    video?.codec_name !== "vp9" ||
    video?.width !== 1920 ||
    video?.height !== 1080 ||
    Number(video?.nb_read_frames) !== Number(reference.decodedVideoFrames) ||
    videoPacketSha256 !== reference.videoPacketSha256 ||
    decodedVideoSha256 !== reference.decodedVideoSha256
  ) {
    throw new Error(
      `Generated IVF input stress fixture is invalid: ${JSON.stringify({
        bytes: file.size,
        format: probe.format?.format_name,
        streams: probe.streams.length,
        videoCodec: video?.codec_name,
        width: video?.width,
        height: video?.height,
        decodedVideoFrames: Number(video?.nb_read_frames),
        expectedDecodedVideoFrames: Number(reference.decodedVideoFrames),
        packetHashPassed: videoPacketSha256 === reference.videoPacketSha256,
        decodedHashPassed: decodedVideoSha256 === reference.decodedVideoSha256,
      })}.`,
    );
  }
  return {
    generatedBy: "scripts/generate-ivf-stress-fixtures.mjs",
    sourceFixture: path.basename(webmPath),
    bytes: file.size,
    sha256,
    durationSeconds: reference.decodedVideoDurationSeconds,
    decodedVideoDurationSeconds: reference.decodedVideoDurationSeconds,
    decodedVideoFrames: reference.decodedVideoFrames,
    decodedVideoSha256,
    videoPacketBytes: videoPackets.bytes,
    videoPacketCount: videoPackets.count,
    maximumPacketBytes: videoPackets.maximumBytes,
    videoPacketSha256,
    probe,
  };
}

async function inspectFixture(filePath, reference) {
  const [file, sha256, probe, videoPackets, videoPacketSha256] =
    await Promise.all([
      stat(filePath),
      hashFile(filePath),
      probeFile(filePath),
      packetStats(filePath),
      packetHash(filePath, "0:v:0"),
    ]);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  if (
    file.size < minimumBytes ||
    video?.codec_name !== "vp9" ||
    video?.width !== 1920 ||
    video?.height !== 1080 ||
    Number(video?.nb_read_frames) !== Number(reference.decodedVideoFrames) ||
    audio?.codec_name !== "opus" ||
    audio?.tags?.language !== "eng"
  ) {
    throw new Error(
      `Generated ${path.extname(filePath)} stress fixture is invalid: ${JSON.stringify(
        {
          bytes: file.size,
          minimumBytes,
          videoCodec: video?.codec_name,
          width: video?.width,
          height: video?.height,
          decodedVideoFrames: Number(video?.nb_read_frames),
          expectedDecodedVideoFrames: Number(reference.decodedVideoFrames),
          audioCodec: audio?.codec_name,
          audioLanguage: audio?.tags?.language ?? null,
        },
      )}.`,
    );
  }
  return {
    ...reference,
    generatedBy: "scripts/generate-ivf-stress-fixtures.mjs",
    bytes: file.size,
    sha256,
    videoPacketBytes: videoPackets.bytes,
    videoPacketCount: videoPackets.count,
    maximumPacketBytes: videoPackets.maximumBytes,
    videoPacketSha256,
    probe,
  };
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
      "-of",
      "json",
      filePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function packetStats(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_packets",
      "-show_entries",
      "packet=size",
      "-of",
      "json",
      filePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const sizes = JSON.parse(stdout).packets.map((packet) => Number(packet.size));
  if (
    !sizes.length ||
    sizes.some((size) => !Number.isSafeInteger(size) || size <= 0)
  ) {
    throw new Error("VP9 packet sizes are unavailable.");
  }
  return {
    bytes: sizes.reduce((total, size) => total + size, 0),
    count: sizes.length,
    maximumBytes: Math.max(...sizes),
  };
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

async function decodedVideoHash(filePath) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-xerror",
      "-i",
      filePath,
      "-map",
      "0:v:0",
      "-f",
      "hash",
      "-hash",
      "sha256",
      "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const value = stdout.trim().match(/^SHA256=([0-9a-f]{64})$/i)?.[1];
  if (!value) throw new Error("Decoded video hash is unavailable.");
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
