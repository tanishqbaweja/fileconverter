import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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
const complexFixturePath = path.join(fixtureRoot, "complex-remux-source.mkv");
const complexWorkRoot = path.join(projectRoot, "work", "complex-media-fixture");
const complexEncodedPath = path.join(complexWorkRoot, "complex-encoded.mkv");

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

await rm(complexWorkRoot, { recursive: true, force: true });
await mkdir(complexWorkRoot, { recursive: true });
const subtitlePath = path.join(complexWorkRoot, "captions.srt");
const chapterPath = path.join(complexWorkRoot, "chapters.ffmeta");
const attachmentPath = path.join(complexWorkRoot, "within-notes.txt");
try {
  await writeFile(
    subtitlePath,
    "1\n00:00:00,250 --> 00:00:01,500\nPrivate caption one.\n\n" +
      "2\n00:00:02,250 --> 00:00:03,750\nPrivate caption two.\n",
    "utf8",
  );
  await writeFile(
    chapterPath,
    ";FFMETADATA1\n" +
      "title=Within complex remux fixture\n" +
      "comment=Deterministic multi-stream metadata\n" +
      "[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=2000\ntitle=Opening\n" +
      "[CHAPTER]\nTIMEBASE=1/1000\nSTART=2000\nEND=4000\ntitle=Closing\n",
    "utf8",
  );
  await writeFile(
    attachmentPath,
    "Within deterministic attachment.\n",
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
      "testsrc2=size=640x360:rate=24:duration=4",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=440:sample_rate=48000:duration=4",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:sample_rate=48000:duration=4",
      "-i",
      subtitlePath,
      "-f",
      "ffmetadata",
      "-i",
      chapterPath,
      "-map",
      "0:v:0",
      "-map",
      "1:a:0",
      "-map",
      "2:a:0",
      "-map",
      "3:s:0",
      "-map_metadata",
      "4",
      "-map_chapters",
      "4",
      "-vf",
      "setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709,select='if(lt(t,2),not(mod(n,2)),1)'",
      "-fps_mode:v:0",
      "vfr",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-tune",
      "zerolatency",
      "-g",
      "48",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-c:s",
      "srt",
      "-metadata:s:v:0",
      "title=Variable timing video",
      "-metadata:s:a:0",
      "language=eng",
      "-metadata:s:a:0",
      "title=Primary English audio",
      "-metadata:s:a:1",
      "language=spa",
      "-metadata:s:a:1",
      "title=Secondary Spanish audio",
      "-metadata:s:s:0",
      "language=fra",
      "-disposition:a:0",
      "default",
      "-disposition:a:1",
      "0",
      "-attach",
      attachmentPath,
      "-metadata:s:t:0",
      "filename=within-notes.txt",
      "-metadata:s:t:0",
      "mimetype=text/plain",
      "-fflags",
      "+bitexact",
      "-flags:v",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      complexEncodedPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-display_rotation:v:0",
      "90",
      "-noautorotate",
      "-i",
      complexEncodedPath,
      "-map",
      "0",
      "-map_metadata",
      "0",
      "-map_chapters",
      "0",
      "-c",
      "copy",
      "-fflags",
      "+bitexact",
      complexFixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
} finally {
  await rm(complexWorkRoot, { recursive: true, force: true });
}

const complexBytes = await readFile(complexFixturePath);
const { stdout: complexProbe } = await execFileAsync(
  "ffprobe",
  [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-show_chapters",
    "-of",
    "json",
    complexFixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
await writeFile(
  `${complexFixturePath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-media-fixture.mjs",
      bytes: complexBytes.byteLength,
      sha256: createHash("sha256").update(complexBytes).digest("hex"),
      probe: JSON.parse(complexProbe),
    },
    null,
    2,
  )}\n`,
  "utf8",
);

process.stdout.write(`${fixturePath}\n${complexFixturePath}\n`);
