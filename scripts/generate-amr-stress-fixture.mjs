import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "fixtures", "media", "audio-source.amr");
const sourceManifestPath = `${sourcePath}.json`;
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const fixturePath = path.join(fixtureRoot, "audio-amr-nb-128m.amr");
const minimumBytes = 128 * 1024 * 1024;

let previousManifest = null;
try {
  previousManifest = JSON.parse(await readFile(`${fixturePath}.json`, "utf8"));
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

await execFileAsync("node", ["scripts/generate-amr-fixture.mjs"], {
  cwd: projectRoot,
  windowsHide: true,
  maxBuffer: 8 * 1024 * 1024,
});
const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
const rawAmrHeaderBytes = 6;
const sourcePayloadBytes = sourceManifest.bytes - rawAmrHeaderBytes;
if (sourcePayloadBytes <= 0) {
  throw new Error("The AMR source does not contain a payload after its header.");
}
const totalSourceCopies =
  Math.ceil((minimumBytes - rawAmrHeaderBytes) / sourcePayloadBytes) + 1;
const additionalLoops = totalSourceCopies - 1;

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-stream_loop", String(additionalLoops), "-i", sourcePath,
    "-map", "0:a:0", "-c:a", "copy", "-fflags", "+bitexact",
    "-f", "amr", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
if (fixtureStat.size < minimumBytes) {
  throw new Error(`Generated AMR is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`);
}
const hash = createHash("sha256");
for await (const chunk of createReadStream(fixturePath, {
  highWaterMark: 4 * 1024 * 1024,
})) {
  hash.update(chunk);
}
const fixtureSha256 = hash.digest("hex");
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
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
  !Number.isFinite(decodedAudioDurationSeconds)
) {
  throw new Error("Generated stress fixture is not the expected mono AMR-NB stream.");
}
const canReuseDecodedReference =
  previousManifest?.sha256 === fixtureSha256 &&
  previousManifest?.bytes === fixtureStat.size &&
  previousManifest?.decodedPcmSha256;
let decodedPcmSha256 = previousManifest?.decodedPcmSha256;
if (!canReuseDecodedReference) {
  const { stdout: decodedHash } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-xerror", "-i", fixturePath,
      "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "hash",
      "-hash", "sha256", "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  decodedPcmSha256 = decodedHash.trim().split("=")[1];
}
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-amr-stress-fixture.mjs",
    source: "fixtures/media/audio-source.amr",
    sourceSha256: sourceManifest.sha256,
    totalSourceCopies,
    rawAmrHeaderBytes,
    decodedAudioDurationSeconds,
    durationSeconds: decodedAudioDurationSeconds,
    bytes: fixtureStat.size,
    sha256: fixtureSha256,
    losslessPcmReference: true,
    decodedPcmSha256,
    decodedPcmReferenceReused: Boolean(canReuseDecodedReference),
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
