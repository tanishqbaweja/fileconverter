import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "fixtures", "media", "theora-video-source.ogv");
const sourceManifestPath = `${sourcePath}.json`;
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const fixturePath = path.join(fixtureRoot, "theora-video-128m.ogv");
const minimumBytes = 128 * 1024 * 1024;
const durationSeconds = 780;
const additionalLoops = 194;
const totalSourceCopies = additionalLoops + 1;

await execFileAsync("node", ["scripts/generate-ogv-fixture.mjs"], {
  cwd: projectRoot,
  windowsHide: true,
  maxBuffer: 8 * 1024 * 1024,
});
await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-stream_loop", String(additionalLoops), "-i", sourcePath,
    "-map", "0:v:0", "-map", "0:a:0",
    "-c:v", "copy", "-c:a", "libvorbis", "-q:a", "5",
    "-map_metadata", "0", "-metadata:s:a:0", "language=eng",
    "-fflags", "+bitexact", "-f", "ogg", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
if (fixtureStat.size < minimumBytes) {
  throw new Error(`Generated OGV is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`);
}
const hash = createHash("sha256");
for await (const chunk of createReadStream(fixturePath, {
  highWaterMark: 4 * 1024 * 1024,
})) {
  hash.update(chunk);
}
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-show_chapters", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
const codecs = probe.streams.map((stream) => stream.codec_name);
if (
  !probe.format?.format_name?.split(",").includes("ogg") ||
  codecs[0] !== "theora" ||
  codecs[1] !== "vorbis"
) {
  throw new Error(`Generated stress fixture is not Theora/Vorbis OGV: ${codecs.join(", ")}.`);
}
const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
const sourceAudio = sourceManifest.probe.streams.find(
  (stream) => stream.codec_type === "audio",
);
const decodedAudioDurationSeconds =
  Number(sourceAudio?.duration) * totalSourceCopies;
if (!Number.isFinite(decodedAudioDurationSeconds)) {
  throw new Error("Could not derive decoded Vorbis duration from the source fixture.");
}
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-ogv-stress-fixture.mjs",
    source: "fixtures/media/theora-video-source.ogv",
    sourceSha256: sourceManifest.sha256,
    durationSeconds,
    decodedAudioDurationSeconds,
    bytes: fixtureStat.size,
    sha256: hash.digest("hex"),
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
