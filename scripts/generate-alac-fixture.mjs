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
const fixturePath = path.join(fixtureRoot, "audio-source-alac.m4a");

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-f", "lavfi", "-i",
    "aevalsrc=0.18*sin(2*PI*997*t)|0.18*sin(2*PI*1499*t):s=48000:d=4",
    "-channel_layout", "stereo", "-c:a", "alac", "-sample_fmt", "s16p",
    "-min_prediction_order", "4", "-max_prediction_order", "4",
    "-movflags", "empty_moov+default_base_moof", "-frag_duration", "5000000",
    "-metadata", "title=Within deterministic ALAC fixture",
    "-metadata:s:a:0", "language=eng", "-fflags", "+bitexact",
    "-flags:a", "+bitexact", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
const sourceHash = createHash("sha256");
for await (const chunk of createReadStream(fixturePath, {
  highWaterMark: 1024 * 1024,
})) {
  sourceHash.update(chunk);
}
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-show_format", "-show_streams", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
const audio = probe.streams.find((stream) => stream.codec_type === "audio");
if (
  !probe.format?.format_name?.includes("mov") ||
  probe.streams.length !== 1 ||
  audio?.codec_name !== "alac" ||
  audio?.sample_rate !== "48000" ||
  audio?.channels !== 2 ||
  Math.abs(Number(probe.format.duration) - 4) > 0.01
) {
  throw new Error("Generated fixture is not the expected stereo ALAC M4A stream.");
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
    generatedBy: "scripts/generate-alac-fixture.mjs",
    durationSeconds: 4,
    bytes: fixtureStat.size,
    sha256: sourceHash.digest("hex"),
    losslessPcmReference: true,
    decodedPcmSha256: decodedHash.trim().split("=")[1],
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
