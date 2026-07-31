import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "media");
const fixturePath = path.join(fixtureRoot, "remux-source.mkv");
const audioFixturePath = path.join(fixtureRoot, "audio-source.m4a");
const mp3FixturePath = path.join(fixtureRoot, "audio-source.mp3");
const flacFixturePath = path.join(fixtureRoot, "audio-source.flac");
const wavFixturePath = path.join(fixtureRoot, "audio-source.wav");
const aiffFixturePath = path.join(fixtureRoot, "audio-source.aiff");
const oggFixturePath = path.join(fixtureRoot, "audio-source.ogg");
const opusFixturePath = path.join(fixtureRoot, "audio-source.opus");

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=24",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=997:sample_rate=48000",
    "-t",
    "4",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-g",
    "48",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-metadata",
    "title=Within deterministic remux fixture",
    "-metadata:s:a:0",
    "language=eng",
    "-fflags",
    "+bitexact",
    "-flags:v",
    "+bitexact",
    "-flags:a",
    "+bitexact",
    fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);

const bytes = await readFile(fixturePath);
const { stdout } = await execFileAsync(
  "ffprobe",
  [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-media-fixture.mjs",
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      probe: JSON.parse(stdout),
    },
    null,
    2,
  )}\n`,
  "utf8",
);

await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=997:sample_rate=48000",
    "-t",
    "4",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-metadata",
    "title=Within deterministic audio fixture",
    "-metadata:s:a:0",
    "language=eng",
    "-fflags",
    "+bitexact",
    "-flags:a",
    "+bitexact",
    audioFixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
const audioBytes = await readFile(audioFixturePath);
const { stdout: audioProbe } = await execFileAsync(
  "ffprobe",
  [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    audioFixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
await writeFile(
  `${audioFixturePath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-media-fixture.mjs",
      bytes: audioBytes.byteLength,
      sha256: createHash("sha256").update(audioBytes).digest("hex"),
      losslessPcmReference: false,
      minimumDecodedAudioPsnrDb: 60,
      probe: JSON.parse(audioProbe),
    },
    null,
    2,
  )}\n`,
  "utf8",
);

for (const [outputPath, codecArguments, title, losslessPcmReference] of [
  [
    mp3FixturePath,
    ["-c:a", "libmp3lame", "-b:a", "192k"],
    "Within deterministic MP3 fixture",
    false,
  ],
  [
    flacFixturePath,
    ["-c:a", "flac", "-sample_fmt", "s16"],
    "Within deterministic FLAC fixture",
    true,
  ],
  [
    wavFixturePath,
    ["-c:a", "pcm_s16le"],
    "Within deterministic WAV fixture",
    true,
  ],
  [
    aiffFixturePath,
    ["-c:a", "pcm_s16be"],
    "Within deterministic AIFF fixture",
    true,
  ],
  [
    oggFixturePath,
    ["-c:a", "libvorbis", "-q:a", "5"],
    "Within deterministic Ogg Vorbis fixture",
    false,
  ],
  [
    opusFixturePath,
    ["-c:a", "libopus", "-b:a", "128k"],
    "Within deterministic Opus fixture",
    false,
  ],
]) {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=997:sample_rate=48000",
      "-t",
      "4",
      ...codecArguments,
      "-metadata",
      `title=${title}`,
      "-fflags",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      outputPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const source = await readFile(outputPath);
  const { stdout: probe } = await execFileAsync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      outputPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const decodedPcmSha256 = losslessPcmReference
    ? (
        await execFileAsync(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            outputPath,
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
          {
            cwd: projectRoot,
            windowsHide: true,
            maxBuffer: 8 * 1024 * 1024,
          },
        )
      ).stdout.trim().split("=")[1]
    : null;
  await writeFile(
    `${outputPath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-media-fixture.mjs",
        bytes: source.byteLength,
        sha256: createHash("sha256").update(source).digest("hex"),
        losslessPcmReference,
        ...(losslessPcmReference
          ? { decodedPcmSha256 }
          : { minimumDecodedAudioPsnrDb: 60 }),
        probe: JSON.parse(probe),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}
process.stdout.write(`${fixturePath}\n`);
