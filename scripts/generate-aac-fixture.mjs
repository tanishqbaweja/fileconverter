import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "media");
const fixturePath = path.join(fixtureRoot, "audio-source.aac");

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-f", "lavfi", "-i",
    "aevalsrc=0.18*sin(2*PI*997*t)|0.18*sin(2*PI*1499*t):s=48000:d=4",
    "-channel_layout", "stereo", "-c:a", "aac", "-profile:a", "aac_low",
    "-b:a", "384k", "-flags:a", "+bitexact", "-fflags", "+bitexact",
    "-f", "adts", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
const hash = createHash("sha256");
for await (const chunk of createReadStream(fixturePath, {
  highWaterMark: 1024 * 1024,
})) {
  hash.update(chunk);
}
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
const audio = probe.streams.find((stream) => stream.codec_type === "audio");
const decodedAudioDurationSeconds =
  (Number(audio?.nb_read_frames) * 1024) / Number(audio?.sample_rate);
if (
  probe.format?.format_name !== "aac" ||
  probe.streams.length !== 1 ||
  audio?.codec_name !== "aac" ||
  audio?.profile !== "LC" ||
  audio?.channels !== 2 ||
  !Number.isFinite(decodedAudioDurationSeconds)
) {
  throw new Error("Generated fixture is not the expected stereo AAC-LC ADTS stream.");
}
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-aac-fixture.mjs",
    decodedAudioDurationSeconds,
    bytes: fixtureStat.size,
    sha256: hash.digest("hex"),
    losslessPcmReference: false,
    minimumDecodedAudioPsnrDb: 60,
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
