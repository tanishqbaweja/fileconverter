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
const minimumBytes = 128 * 1024 * 1024;
const fixtures = [
  {
    name: "audio-wma-128m.wma",
    durationSeconds: 1900,
    codec: "wmav2",
    losslessPcmReference: false,
    minimumDecodedAudioPsnrDb: 60,
    outputArguments: [
      "-c:a", "wmav2", "-b:a", "320k", "-ar", "48000", "-ac", "2",
      "-f", "asf",
    ],
  },
  {
    name: "audio-pcm-wma-128m.wav",
    durationSeconds: 800,
    codec: "pcm_s16le",
    losslessPcmReference: true,
    minimumDecodedAudioPsnrDb: 30,
    outputArguments: ["-c:a", "pcm_s16le"],
  },
  {
    name: "audio-flac-wma-128m.flac",
    durationSeconds: 800,
    codec: "flac",
    losslessPcmReference: true,
    minimumDecodedAudioPsnrDb: 30,
    outputArguments: ["-c:a", "flac", "-sample_fmt", "s16"],
  },
];

await execFileAsync("node", ["scripts/generate-wma-fixture.mjs"], {
  cwd: projectRoot,
  windowsHide: true,
  maxBuffer: 8 * 1024 * 1024,
});
await mkdir(fixtureRoot, { recursive: true });

for (const fixture of fixtures) {
  const fixturePath = path.join(fixtureRoot, fixture.name);
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-f", "lavfi", "-i",
      `anoisesrc=color=white:amplitude=0.25:sample_rate=48000:seed=515151:d=${fixture.durationSeconds}`,
      "-f", "lavfi", "-i",
      `anoisesrc=color=white:amplitude=0.25:sample_rate=48000:seed=515152:d=${fixture.durationSeconds}`,
      "-filter_complex", "[0:a][1:a]amerge=inputs=2[a]", "-map", "[a]",
      "-t", String(fixture.durationSeconds), "-threads", "1",
      ...fixture.outputArguments,
      "-metadata", "title=Within deterministic WMA stress fixture",
      "-fflags", "+bitexact", "-flags:a", "+bitexact", fixturePath,
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
    Math.abs(Number(probe.format.duration) - fixture.durationSeconds) > 0.01
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
  await writeFile(
    `${fixturePath}.json`,
    `${JSON.stringify({
      generatedBy: "scripts/generate-wma-stress-fixture.mjs",
      durationSeconds: fixture.durationSeconds,
      bytes: fixtureStat.size,
      sha256: sourceHash.digest("hex"),
      losslessPcmReference: fixture.losslessPcmReference,
      minimumDecodedAudioPsnrDb: fixture.minimumDecodedAudioPsnrDb,
      decodedPcmSha256: decodedHash.trim().split("=")[1],
      probe,
    }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${fixturePath}\n`);
}
