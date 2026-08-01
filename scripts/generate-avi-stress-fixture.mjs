import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "fixtures", "media", "legacy-video-source.avi");
const sourceManifestPath = `${sourcePath}.json`;
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const fixturePath = path.join(fixtureRoot, "legacy-video-128m.avi");
const minimumBytes = 128 * 1024 * 1024;
const durationSeconds = 720;

await execFileAsync("node", ["scripts/generate-avi-fixture.mjs"], {
  cwd: projectRoot,
  windowsHide: true,
  maxBuffer: 8 * 1024 * 1024,
});
await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-stream_loop", "-1", "-i", sourcePath, "-t", String(durationSeconds),
    "-map", "0:v:0", "-map", "0:a:0",
    "-c", "copy", "-map_metadata", "0",
    "-fflags", "+bitexact", "-f", "avi", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
if (fixtureStat.size < minimumBytes) {
  throw new Error(`Generated AVI is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`);
}
const hash = createHash("sha256");
for await (const chunk of createReadStream(fixturePath, {
  highWaterMark: 4 * 1024 * 1024,
})) {
  hash.update(chunk);
}
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
const codecs = probe.streams.map((stream) => stream.codec_name);
if (
  !probe.format?.format_name?.split(",").includes("avi") ||
  codecs[0] !== "mpeg4" ||
  codecs[1] !== "mp3"
) {
  throw new Error(`Generated stress fixture is not MPEG-4 Part 2/MP3 AVI: ${codecs.join(", ")}.`);
}
const audioStream = probe.streams.find((stream) => stream.codec_type === "audio");
const decodedAudioDurationSeconds =
  (Number(audioStream?.nb_read_frames) * 1152) /
  Number(audioStream?.sample_rate);
if (!Number.isFinite(decodedAudioDurationSeconds)) {
  throw new Error("Could not derive the decoded MP3 duration for validation.");
}
const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-avi-stress-fixture.mjs",
    source: "fixtures/media/legacy-video-source.avi",
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
