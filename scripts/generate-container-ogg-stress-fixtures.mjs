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
const av1OpusManifestPath = `${av1OpusMkv}.json`;
const retainedAv1Manifest = await readFile(av1OpusManifestPath, "utf8");
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
const requestedNames = new Set(process.argv.slice(2));
const selectedGenerated = requestedNames.size === 0
  ? generated
  : generated.filter((fixture) => requestedNames.has(path.basename(fixture.path)));
const unknownNames = [...requestedNames].filter(
  (name) => !generated.some((fixture) => path.basename(fixture.path) === name),
);
if (unknownNames.length > 0 || selectedGenerated.length === 0) {
  throw new Error(
    `Unknown container-Ogg fixture selection: ${unknownNames.join(", ") || "none"}.`,
  );
}
const retainedManifests = new Map();

try {
  await mkdir(fixtureRoot, { recursive: true });
  const sourceGenerators = [runNode("scripts/generate-av1-opus-stress-fixture.mjs")];
  if (selectedGenerated.some((fixture) => fixture.inputs.includes(ogvVorbis))) {
    sourceGenerators.push(runNode("scripts/generate-ogv-stress-fixture.mjs"));
  }
  await Promise.all(sourceGenerators);
  for (const fixture of selectedGenerated) {
    retainedManifests.set(
      `${fixture.path}.json`,
      await readFile(`${fixture.path}.json`, "utf8").catch((error) => {
        if (error?.code === "ENOENT") return null;
        throw error;
      }),
    );
  }
  await Promise.all(
    selectedGenerated.map((fixture) =>
      execFileAsync(
        "ffmpeg",
        ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...fixture.arguments, fixture.path],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      ),
    ),
  );
  const minimumBytes = 128 * 1024 * 1024;
  for (const fixture of selectedGenerated) {
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
  process.stdout.write(
    `Generated ${selectedGenerated.length} Ogg-family extraction source${selectedGenerated.length === 1 ? "" : "s"} in ${((performance.now() - startedAt) / 1000).toFixed(2)} seconds.\n`,
  );
} catch (error) {
  for (const fixture of selectedGenerated) {
    await rm(fixture.path, { force: true });
    const manifestPath = `${fixture.path}.json`;
    const retained = retainedManifests.get(manifestPath);
    if (retained == null) await rm(manifestPath, { force: true });
    else await writeFile(manifestPath, retained, "utf8");
  }
  throw error;
} finally {
  await writeFile(av1OpusManifestPath, retainedAv1Manifest, "utf8");
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
