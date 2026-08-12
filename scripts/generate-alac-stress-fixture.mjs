import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const durationSeconds = 800;
const minimumBytes = 128 * 1024 * 1024;
const fixtures = [
  {
    name: "audio-alac-128m.m4a",
    codec: "alac",
    outputArguments: [
      "-c:a", "alac", "-sample_fmt", "s16p",
      "-min_prediction_order", "4", "-max_prediction_order", "4",
      "-movflags", "empty_moov+default_base_moof", "-frag_duration", "5000000",
    ],
  },
  {
    name: "audio-flac-alac-128m.flac",
    codec: "flac",
    outputArguments: ["-c:a", "flac", "-sample_fmt", "s16"],
  },
  {
    name: "audio-pcm-alac-128m.wav",
    codec: "pcm_s16le",
    outputArguments: ["-c:a", "pcm_s16le"],
  },
];

await execFileAsync("node", ["scripts/generate-alac-fixture.mjs"], {
  cwd: projectRoot,
  windowsHide: true,
  maxBuffer: 8 * 1024 * 1024,
});
await mkdir(fixtureRoot, { recursive: true });

const requestedNames = new Set(process.argv.slice(2));
const selectedFixtures = requestedNames.size
  ? fixtures.filter((fixture) => requestedNames.has(fixture.name))
  : fixtures;
if (selectedFixtures.length !== (requestedNames.size || fixtures.length)) {
  throw new Error(
    `Unknown fixture name. Choose from: ${fixtures.map((fixture) => fixture.name).join(", ")}.`,
  );
}

let referencePcmHash = null;
for (const fixture of selectedFixtures) {
  const fixturePath = path.join(fixtureRoot, fixture.name);
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-f", "lavfi", "-i",
      `anoisesrc=color=white:amplitude=0.25:sample_rate=48000:seed=424242:d=${durationSeconds}`,
      "-f", "lavfi", "-i",
      `anoisesrc=color=white:amplitude=0.25:sample_rate=48000:seed=424243:d=${durationSeconds}`,
      "-filter_complex", "[0:a][1:a]amerge=inputs=2[a]", "-map", "[a]",
      "-t", String(durationSeconds), "-threads", "1", ...fixture.outputArguments,
      "-metadata", "title=Within deterministic ALAC stress fixture",
      "-metadata:s:a:0", "language=eng", "-fflags", "+bitexact",
      "-flags:a", "+bitexact", fixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );

  const fixtureStat = await stat(fixturePath);
  if (fixtureStat.size < minimumBytes) {
    throw new Error(
      `${fixture.name} is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`,
    );
  }
  const sourceHash = createHash("sha256");
  for await (const chunk of createReadStream(fixturePath, {
    highWaterMark: 4 * 1024 * 1024,
  })) {
    sourceHash.update(chunk);
  }
  const { stdout: probeJson } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", fixturePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const probe = JSON.parse(probeJson);
  const audio = probe.streams.find((stream) => stream.codec_type === "audio");
  if (
    probe.streams.length !== 1 ||
    audio?.codec_name !== fixture.codec ||
    audio?.sample_rate !== "48000" ||
    audio?.channels !== 2 ||
    Math.abs(Number(probe.format.duration) - durationSeconds) > 0.01
  ) {
    throw new Error(`${fixture.name} failed its independent audio probe.`);
  }
  const { stdout: decodedHash } = await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-i", fixturePath,
      "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "hash",
      "-hash", "sha256", "-",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const decodedPcmSha256 = decodedHash.trim().split("=")[1];
  if (referencePcmHash && decodedPcmSha256 !== referencePcmHash) {
    throw new Error(`${fixture.name} does not decode to the shared PCM reference.`);
  }
  referencePcmHash = decodedPcmSha256;
  await writeFile(
    `${fixturePath}.json`,
    `${JSON.stringify({
      generatedBy: "scripts/generate-alac-stress-fixture.mjs",
      durationSeconds,
      bytes: fixtureStat.size,
      sha256: sourceHash.digest("hex"),
      losslessPcmReference: true,
      decodedPcmSha256,
      probe,
    }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${fixturePath}\n`);
}
