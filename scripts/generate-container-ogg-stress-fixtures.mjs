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
const av1OpusMkv = path.join(fixtureRoot, "av1-opus-128m.mkv");
const ogvVorbis = path.join(fixtureRoot, "theora-video-128m.ogv");
const generated = [
  {
    path: path.join(fixtureRoot, "av1-opus-128m.webm"),
    codec: "opus",
    inputs: [av1OpusMkv],
    arguments: ["-i", av1OpusMkv, "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-map_metadata", "0", "-f", "webm"],
  },
  {
    path: path.join(fixtureRoot, "av1-vorbis-128m.mkv"),
    codec: "vorbis",
    inputs: [av1OpusMkv, ogvVorbis],
    arguments: ["-i", av1OpusMkv, "-i", ogvVorbis, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-shortest", "-map_metadata", "0", "-metadata:s:a:0", "language=eng", "-f", "matroska"],
  },
  {
    path: path.join(fixtureRoot, "av1-vorbis-128m.webm"),
    codec: "vorbis",
    inputs: [av1OpusMkv, ogvVorbis],
    arguments: ["-i", av1OpusMkv, "-i", ogvVorbis, "-map", "0:v:0", "-map", "1:a:0", "-c", "copy", "-shortest", "-map_metadata", "0", "-metadata:s:a:0", "language=eng", "-f", "webm"],
  },
];
const retainedManifests = new Map();

try {
  await mkdir(fixtureRoot, { recursive: true });
  await Promise.all([
    runNode("scripts/generate-av1-opus-stress-fixture.mjs"),
    runNode("scripts/generate-ogv-stress-fixture.mjs"),
  ]);
  for (const fixture of generated) {
    retainedManifests.set(
      `${fixture.path}.json`,
      await readFile(`${fixture.path}.json`, "utf8").catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      }),
    );
  }
  await Promise.all(
    generated.map((fixture) =>
      execFileAsync(
        "ffmpeg",
        ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...fixture.arguments, fixture.path],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      ),
    ),
  );
  const minimumBytes = 128 * 1024 * 1024;
  for (const fixture of generated) {
    const [fixtureStat, probe, audioPacketSha256] = await Promise.all([
      stat(fixture.path),
      probeFile(fixture.path),
      packetHash(fixture.path),
    ]);
    if (fixtureStat.size < minimumBytes) {
      throw new Error(`${path.basename(fixture.path)} is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`);
    }
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    const audio = probe.streams.find((stream) => stream.codec_type === "audio");
    if (video?.codec_name !== "av1" || audio?.codec_name !== fixture.codec) {
      throw new Error(`${path.basename(fixture.path)} is not AV1/${fixture.codec}.`);
    }
    await writeFile(
      `${fixture.path}.json`,
      `${JSON.stringify({
        generatedBy: "scripts/generate-container-ogg-stress-fixtures.mjs",
        sources: fixture.inputs.map((input) => path.relative(projectRoot, input).replaceAll("\\", "/")),
        bytes: fixtureStat.size,
        sha256: await hashFile(fixture.path),
        audioCodec: fixture.codec,
        audioPacketSha256,
        audioPacketCount: Number(audio.nb_read_packets),
        generationSeconds: Number(((performance.now() - startedAt) / 1000).toFixed(2)),
        probe,
      }, null, 2)}\n`,
      "utf8",
    );
    process.stdout.write(`${fixture.path}\n`);
  }
  process.stdout.write(`Generated five Ogg-family extraction sources in ${((performance.now() - startedAt) / 1000).toFixed(2)} seconds.\n`);
} catch (error) {
  for (const fixture of generated) {
    await rm(fixture.path, { force: true });
    const manifestPath = `${fixture.path}.json`;
    const retained = retainedManifests.get(manifestPath);
    if (retained == null) await rm(manifestPath, { force: true });
    else await writeFile(manifestPath, retained, "utf8");
  }
  throw error;
}

async function runNode(script) {
  await execFileAsync(process.execPath, [script], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
}

async function probeFile(filePath) {
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-count_packets", "-show_format", "-show_streams", "-show_chapters", "-of", "json", filePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function packetHash(filePath) {
  const { stdout } = await execFileAsync(
    "ffmpeg",
    ["-v", "error", "-xerror", "-i", filePath, "-map", "0:a:0", "-c", "copy", "-f", "hash", "-hash", "sha256", "-"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const value = stdout.trim().match(/^SHA256=([0-9a-f]{64})$/i)?.[1];
  if (!value) throw new Error(`Packet hash is unavailable for ${filePath}.`);
  return value.toLowerCase();
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
