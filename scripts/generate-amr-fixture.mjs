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
const fixturePath = path.join(fixtureRoot, "audio-source.amr");

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-f", "lavfi", "-i",
    "aevalsrc=0.2*sin(2*PI*697*t)+0.05*sin(2*PI*1209*t):s=8000:d=4",
    "-c:a", "libopencore_amrnb", "-b:a", "12.2k", "-ar", "8000",
    "-ac", "1", "-flags:a", "+bitexact", "-fflags", "+bitexact",
    "-f", "amr", fixturePath,
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
  (Number(audio?.nb_read_frames) * 160) / Number(audio?.sample_rate);
if (
  probe.format?.format_name !== "amr" ||
  probe.streams.length !== 1 ||
  audio?.codec_name !== "amr_nb" ||
  audio?.sample_rate !== "8000" ||
  audio?.channels !== 1 ||
  !Number.isFinite(decodedAudioDurationSeconds) ||
  Math.abs(decodedAudioDurationSeconds - 4) > 0.1
) {
  throw new Error("Generated fixture is not the expected mono AMR-NB stream.");
}
const { stdout: decodedHash } = await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-i", fixturePath,
    "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "hash",
    "-hash", "sha256", "-",
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-amr-fixture.mjs",
    decodedAudioDurationSeconds,
    durationSeconds: decodedAudioDurationSeconds,
    bytes: fixtureStat.size,
    sha256: hash.digest("hex"),
    losslessPcmReference: true,
    decodedPcmSha256: decodedHash.trim().split("=")[1],
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
