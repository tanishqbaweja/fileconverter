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
const sourcePath = path.join(projectRoot, "fixtures", "media", "mobile-video-source.3gp");
const sourceManifestPath = `${sourcePath}.json`;
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const minimumBytes = 128 * 1024 * 1024;
const durationSeconds = 65;
const fixtures = [
  { name: "h264-aac-flac-128m.3gp", format: "3gp" },
  { name: "h264-aac-flac-128m.mp4", format: "mp4" },
  { name: "h264-aac-flac-128m.mov", format: "mov" },
  { name: "h264-aac-flac-128m.mkv", format: "matroska" },
  { name: "h264-aac-flac-128m.mpegts", format: "mpegts" },
  { name: "h264-aac-flac-128m.flv", format: "flv" },
];
const fixturePaths = fixtures.map((fixture) => path.join(fixtureRoot, fixture.name));

const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
await assertSource();
await mkdir(fixtureRoot, { recursive: true });

try {
  await execFfmpeg([
    "-stream_loop", "-1", "-i", sourcePath, "-t", String(durationSeconds),
    "-map", "0:v:0", "-map", "0:a:0",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-vf", "scale=1282:536,setsar=1",
    "-b:v", "18M", "-minrate", "18M", "-maxrate", "18M", "-bufsize", "36M",
    "-x264-params", "nal-hrd=cbr:force-cfr=1",
    "-c:a", "copy", "-map_metadata", "0", "-fflags", "+bitexact",
    "-f", fixtures[0].format, fixturePaths[0],
  ]);

  await Promise.all(
    fixtures.slice(1).map((fixture, offset) =>
      execFfmpeg([
        "-i", fixturePaths[0], "-map", "0:v:0", "-map", "0:a:0", "-c", "copy",
        "-map_metadata", "0", "-fflags", "+bitexact",
        "-f", fixture.format, fixturePaths[offset + 1],
      ]),
    ),
  );

  const referenceAacAccessUnitSha256 = await aacAccessUnitHash(fixturePaths[0]);
  const referenceAacAccessUnitCount = await aacAccessUnitCount(fixturePaths[0]);
  for (let index = 0; index < fixtures.length; index += 1) {
    const fixture = fixtures[index];
    const fixturePath = fixturePaths[index];
    const fixtureStat = await stat(fixturePath);
    if (fixtureStat.size < minimumBytes) {
      throw new Error(
        `Generated ${fixture.name} is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`,
      );
    }
    const { stdout } = await execFileAsync(
      "ffprobe",
      ["-v", "error", "-count_packets", "-show_format", "-show_streams", "-show_programs", "-of", "json", fixturePath],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
    );
    const probe = JSON.parse(stdout);
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    const audio = probe.streams.find((stream) => stream.codec_type === "audio");
    if (video?.codec_name !== "h264" || audio?.codec_name !== "aac") {
      throw new Error(`Generated ${fixture.name} is not H.264/AAC.`);
    }
    const aacAccessUnitSha256 = await aacAccessUnitHash(fixturePath);
    const aacAccessUnitCount = Number(audio.nb_read_packets);
    if (
      aacAccessUnitSha256 !== referenceAacAccessUnitSha256 ||
      aacAccessUnitCount !== referenceAacAccessUnitCount
    ) {
      throw new Error(`Generated ${fixture.name} changed the AAC access units.`);
    }
    await writeFile(
      `${fixturePath}.json`,
      `${JSON.stringify({
        generatedBy: "scripts/generate-container-flac-stress-fixtures.mjs",
        source: "fixtures/media/mobile-video-source.3gp",
        sourceSha256: sourceManifest.sha256,
        durationSeconds,
        decodedVideoFrames: durationSeconds * 24,
        bytes: fixtureStat.size,
        sha256: await hashFile(fixturePath),
        aacAccessUnitSha256,
        aacAccessUnitCount,
        generationSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
        probe,
      }, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`${fixturePath}\n`);
  }
  await assertSource();
} catch (error) {
  for (const fixturePath of fixturePaths) {
    await rm(fixturePath, { force: true });
    await rm(`${fixturePath}.json`, { force: true });
  }
  await assertSource();
  throw error;
}

async function execFfmpeg(arguments_) {
  await execFileAsync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...arguments_],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
}

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
  for await (const chunk of createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

async function aacAccessUnitHash(filePath) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    [
      "-v", "error", "-i", filePath, "-map", "0:a:0", "-c", "copy",
      "-bsf:a", "aac_adtstoasc", "-f", "hash", "-hash", "sha256", "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const sha256 = stdout.trim().match(/^SHA256=([0-9a-f]{64})$/i)?.[1];
  if (!sha256) throw new Error(`AAC access-unit hash is unavailable for ${filePath}.`);
  return sha256.toLowerCase();
}

async function aacAccessUnitCount(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    [
      "-v", "error", "-select_streams", "a:0", "-count_packets",
      "-show_entries", "stream=nb_read_packets", "-of", "json", filePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const count = Number(JSON.parse(stdout).streams?.[0]?.nb_read_packets);
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error(`AAC access-unit count is unavailable for ${filePath}.`);
  }
  return count;
}
