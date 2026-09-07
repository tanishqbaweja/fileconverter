import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const startedAt = performance.now();
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const ogvPath = path.join(fixtureRoot, "theora-video-128m.ogv");
const fixturePath = path.join(fixtureRoot, "theora-vorbis-copy-128m.mkv");
const manifestPath = `${fixturePath}.json`;
const retainedManifest = await readFile(manifestPath, "utf8").catch((error) => {
  if (error?.code === "ENOENT") return null;
  throw error;
});
const minimumBytes = 128 * 1024 * 1024;

try {
  await mkdir(fixtureRoot, { recursive: true });
  await execFileAsync("node", ["scripts/generate-ogv-stress-fixture.mjs"], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-i", ogvPath, "-map", "0:v:0", "-map", "0:a:0",
      "-c", "copy", "-map_metadata", "0", "-metadata:s:a:0", "language=eng",
      "-fflags", "+bitexact", "-f", "matroska", fixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const fixtureStat = await stat(fixturePath);
  if (fixtureStat.size < minimumBytes) {
    throw new Error(
      `Generated Matroska fixture is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`,
    );
  }
  const [probe, videoPacketSha256, audioPacketSha256] = await Promise.all([
    probeFile(fixturePath),
    packetHash(fixturePath, "0:v:0"),
    packetHash(fixturePath, "0:a:0"),
  ]);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  const decodedVideoFrames = Number(video?.nb_read_frames);
  const frameRate = 24;
  if (
    !String(probe.format?.format_name ?? "").split(",").includes("matroska") ||
    video?.codec_name !== "theora" ||
    video?.width !== 640 ||
    video?.height !== 360 ||
    !Number.isFinite(decodedVideoFrames) ||
    decodedVideoFrames < 1 ||
    audio?.codec_name !== "vorbis" ||
    audio?.tags?.language !== "eng" ||
    (probe.chapters?.length ?? 0) !== 0
  ) {
    throw new Error("Generated stress fixture is not the expected Theora/Vorbis Matroska source.");
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      generatedBy: "scripts/generate-compatible-ogv-stress-fixture.mjs",
      source: "fixtures/stress/media/theora-video-128m.ogv",
      durationSeconds: decodedVideoFrames / frameRate,
      frameRate,
      decodedVideoFrames,
      decodedVideoDurationSeconds: decodedVideoFrames / frameRate,
      videoPacketSha256,
      videoPacketCount: Number(video?.nb_read_packets),
      audioPacketSha256,
      audioPacketCount: Number(audio?.nb_read_packets),
      bytes: fixtureStat.size,
      sha256: await hashFile(fixturePath),
      generationSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
      probe,
    }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(
    `${fixturePath}\nGenerated Theora/Vorbis Matroska stress source in ${((performance.now() - startedAt) / 1000).toFixed(2)} seconds.\n`,
  );
} catch (error) {
  await rm(fixturePath, { force: true });
  if (retainedManifest === null) {
    await rm(manifestPath, { force: true });
  } else {
    await writeFile(manifestPath, retainedManifest, "utf8");
  }
  throw error;
}

async function probeFile(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error", "-count_frames", "-count_packets", "-show_format",
      "-show_streams", "-show_chapters", "-of", "json", filePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function packetHash(filePath, map) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-v", "error", "-xerror", "-i", filePath, "-map", map,
      "-c", "copy", "-f", "hash", "-hash", "sha256", "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const value = stdout.trim().match(/^SHA256=([0-9a-f]{64})$/i)?.[1];
  if (!value) throw new Error(`Packet hash is unavailable for ${map}.`);
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
