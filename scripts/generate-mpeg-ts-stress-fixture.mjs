import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "fixtures", "media", "remux-source.mkv");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const fixturePath = path.join(fixtureRoot, "transport-128m.mpegts");
const minimumBytes = 128 * 1024 * 1024;
const durationSeconds = 720;

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-stream_loop", "-1", "-i", sourcePath, "-t", String(durationSeconds),
    "-map", "0:v:0", "-map", "0:a:0",
    "-c", "copy", "-map_metadata", "0",
    "-mpegts_m2ts_mode", "0",
    "-mpegts_flags", "+resend_headers",
    "-fflags", "+bitexact", "-f", "mpegts", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
if (fixtureStat.size < minimumBytes) {
  throw new Error(`Generated MPEG-TS is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`);
}
const hash = createHash("sha256");
for await (const chunk of createReadStream(fixturePath, {
  highWaterMark: 4 * 1024 * 1024,
})) {
  hash.update(chunk);
}
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-show_programs", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
if (!probe.format?.format_name?.split(",").includes("mpegts")) {
  throw new Error("Generated stress fixture is not an MPEG transport stream.");
}
const audioStream = probe.streams.find((stream) => stream.codec_type === "audio");
const decodedAudioDurationSeconds =
  (Number(audioStream?.nb_read_frames) * 1024) /
  Number(audioStream?.sample_rate);
if (!Number.isFinite(decodedAudioDurationSeconds)) {
  throw new Error("Could not derive the decoded AAC duration for validation.");
}
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-mpeg-ts-stress-fixture.mjs",
    source: "fixtures/media/remux-source.mkv",
    sourceSha256: "3d0baf6159dcf7219ba4ef8f29b265a26a2fccfb3eefa002e902ca24de68a84d",
    durationSeconds,
    decodedAudioDurationSeconds,
    bytes: fixtureStat.size,
    sha256: hash.digest("hex"),
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
