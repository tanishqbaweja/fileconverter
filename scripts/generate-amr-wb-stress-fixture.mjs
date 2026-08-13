import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "fixtures", "media", "amr-wb-source.awb");
const sourceManifestPath = `${sourcePath}.json`;
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const fixturePath = path.join(fixtureRoot, "audio-amr-wb-128m.awb");
const minimumBytes = 128 * 1024 * 1024;
const expectedSeedSha256 = "259a46a93139ea8e80d18acd53798dd4d1bd4c7cb66965e93a853862343a1381";
const totalSourceCopies = 4_400;

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

const sourceManifest = JSON.parse(await readFile(sourceManifestPath, "utf8"));
if (
  sourceManifest.sha256 !== expectedSeedSha256 ||
  (await sha256(sourcePath)) !== expectedSeedSha256
) {
  throw new Error("The pinned FFmpeg FATE AMR-WB seed does not match its manifest.");
}

try {
  const existingManifest = JSON.parse(await readFile(`${fixturePath}.json`, "utf8"));
  const existingStat = await stat(fixturePath);
  if (
    existingManifest.sourceSha256 === expectedSeedSha256 &&
    existingManifest.totalSourceCopies === totalSourceCopies &&
    existingManifest.bytes === existingStat.size &&
    existingStat.size >= minimumBytes &&
    existingManifest.sha256 === (await sha256(fixturePath)) &&
    existingManifest.decodedPcmSha256 &&
    existingManifest.losslessPcmReference === false &&
    existingManifest.minimumDecodedAudioPsnrDb === 60
  ) {
    process.stdout.write(`${fixturePath}\n`);
    process.exit(0);
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

// The seed has 512 complete 23.85 kb/s packets. Raw AMR-WB removes the small
// 3GP sample-table overhead, so 4,400 copies safely clear the 128 MiB gate.
await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-stream_loop", String(totalSourceCopies - 1), "-i", sourcePath,
    "-map", "0:a:0", "-map_metadata", "-1", "-c:a", "copy",
    "-fflags", "+bitexact", "-f", "amr", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
if (fixtureStat.size < minimumBytes) {
  throw new Error(`Generated AMR-WB is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`);
}
const fixtureSha256 = await sha256(fixturePath);
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
const audio = probe.streams.find((stream) => stream.codec_type === "audio");
const decodedAudioDurationSeconds =
  (Number(audio?.nb_read_frames) * 320) / Number(audio?.sample_rate);
if (
  probe.format?.format_name !== "amr" ||
  probe.streams.length !== 1 ||
  audio?.codec_name !== "amr_wb" ||
  audio?.sample_rate !== "16000" ||
  audio?.channels !== 1 ||
  !Number.isFinite(decodedAudioDurationSeconds)
) {
  throw new Error("Generated stress fixture is not the expected mono AMR-WB stream.");
}
const { stdout: decodedHash } = await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-xerror", "-i", fixturePath,
    "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "hash", "-hash", "sha256", "-",
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);
const decodedPcmSha256 = decodedHash.trim().split("=")[1];
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-amr-wb-stress-fixture.mjs",
    source: "fixtures/media/amr-wb-source.awb",
    sourceSha256: expectedSeedSha256,
    totalSourceCopies,
    decodedAudioDurationSeconds,
    durationSeconds: decodedAudioDurationSeconds,
    bytes: fixtureStat.size,
    sha256: fixtureSha256,
    losslessPcmReference: false,
    minimumDecodedAudioPsnrDb: 60,
    nativeAndWasmDecoderSamplesMayDiffer: true,
    decodedPcmSha256,
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
