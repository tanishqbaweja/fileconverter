import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const rawFixturePath = path.join(fixtureRoot, "audio-amr-nb-128m.amr");
const rawManifestPath = `${rawFixturePath}.json`;
const fixturePath = path.join(fixtureRoot, "audio-amr-nb-128m.3gp");
const minimumBytes = 128 * 1024 * 1024;

await import("./generate-amr-stress-fixture.mjs");
const rawManifest = JSON.parse(await readFile(rawManifestPath, "utf8"));

await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-i",
    rawFixturePath,
    "-map",
    "0:a:0",
    "-map_metadata",
    "-1",
    "-c:a",
    "copy",
    "-fflags",
    "+bitexact",
    "-f",
    "3gp",
    fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
if (fixtureStat.size < minimumBytes) {
  throw new Error(
    `Generated AMR 3GP is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`,
  );
}

const hash = createHash("sha256");
for await (const chunk of createReadStream(fixturePath, {
  highWaterMark: 4 * 1024 * 1024,
})) {
  hash.update(chunk);
}
const { stdout } = await execFileAsync(
  "ffprobe",
  [
    "-v",
    "error",
    "-count_frames",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
const audio = probe.streams.find((stream) => stream.codec_type === "audio");
const decodedAudioDurationSeconds =
  (Number(audio?.nb_read_frames) * 160) / Number(audio?.sample_rate);
if (
  !String(probe.format?.format_name).split(",").includes("3gp") ||
  probe.streams.length !== 1 ||
  audio?.codec_name !== "amr_nb" ||
  audio?.sample_rate !== "8000" ||
  audio?.channels !== 1 ||
  !Number.isFinite(decodedAudioDurationSeconds)
) {
  throw new Error("Generated stress fixture is not 8 kHz mono AMR-NB in 3GP.");
}

const { stdout: decodedHash } = await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-xerror",
    "-i",
    fixturePath,
    "-map",
    "0:a:0",
    "-c:a",
    "pcm_s16le",
    "-f",
    "hash",
    "-hash",
    "sha256",
    "-",
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);
const decodedPcmSha256 = decodedHash.trim().split("=")[1];
if (decodedPcmSha256 !== rawManifest.decodedPcmSha256) {
  throw new Error("AMR packet remuxing into 3GP changed the decoded PCM stream.");
}

await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-3gp-amr-stress-fixture.mjs",
    source: "fixtures/stress/media/audio-amr-nb-128m.amr",
    sourceSha256: rawManifest.sha256,
    decodedAudioDurationSeconds,
    durationSeconds: decodedAudioDurationSeconds,
    bytes: fixtureStat.size,
    sha256: hash.digest("hex"),
    losslessPcmReference: true,
    decodedPcmSha256,
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
