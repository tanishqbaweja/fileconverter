import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "media");
const workRoot = path.join(projectRoot, "work", "audio-artwork-fixture");
const fixturePath = path.join(fixtureRoot, "audio-source-artwork.m4a");
const extractionFixturePath = path.join(
  fixtureRoot,
  "audio-source-mp3-artwork.mp4",
);
const artworkPath = path.join(workRoot, "cover.png");
const intermediateMp3Path = path.join(workRoot, "audio.mp3");

await mkdir(fixtureRoot, { recursive: true });
await rm(workRoot, { recursive: true, force: true });
await mkdir(workRoot, { recursive: true });

try {
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
      "sine=frequency=997:sample_rate=48000:duration=4",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x2457d6:s=64x64:d=0.04",
      "-map",
      "0:a:0",
      "-map",
      "1:v:0",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      "-c:v",
      "png",
      "-disposition:v:0",
      "attached_pic",
      "-map_metadata",
      "-1",
      "-metadata",
      "title=Within artwork title",
      "-metadata",
      "artist=Within artist",
      "-metadata",
      "album=Within album",
      "-metadata",
      "genre=Test genre",
      "-metadata",
      "date=2026",
      "-metadata",
      "track=3/9",
      "-metadata",
      "comment=Within comment",
      "-metadata:s:a:0",
      "language=eng",
      "-metadata:s:v:0",
      "title=Front cover",
      "-fflags",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      fixturePath,
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
      "-i",
      fixturePath,
      "-map",
      "0:a:0",
      "-c:a",
      "libmp3lame",
      "-q:a",
      "4",
      "-map_metadata",
      "0",
      "-id3v2_version",
      "3",
      "-write_xing",
      "0",
      "-fflags",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      intermediateMp3Path,
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
      "-i",
      intermediateMp3Path,
      "-i",
      fixturePath,
      "-map",
      "0:a:0",
      "-map",
      "1:v:0",
      "-c",
      "copy",
      "-disposition:v:0",
      "attached_pic",
      "-map_metadata",
      "0",
      "-fflags",
      "+bitexact",
      extractionFixturePath,
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
      "-i",
      fixturePath,
      "-map",
      "0:v:0",
      "-c:v",
      "copy",
      artworkPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );

  const [fixtureBytes, artworkBytes, { stdout: probe }] = await Promise.all([
    readFile(fixturePath),
    readFile(artworkPath),
    execFileAsync(
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
    ),
  ]);
  await writeFile(
    `${fixturePath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-audio-artwork-fixture.mjs",
        bytes: fixtureBytes.byteLength,
        sha256: createHash("sha256").update(fixtureBytes).digest("hex"),
        artwork: {
          codec: "png",
          width: 64,
          height: 64,
          bytes: artworkBytes.byteLength,
          sha256: createHash("sha256").update(artworkBytes).digest("hex"),
        },
        expectedTags: {
          title: "Within artwork title",
          artist: "Within artist",
          album: "Within album",
          genre: "Test genre",
          date: "2026",
          track: "3/9",
          comment: "Within comment",
        },
        probe: JSON.parse(probe),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  const [extractionFixtureBytes, { stdout: extractionProbe }] =
    await Promise.all([
      readFile(extractionFixturePath),
      execFileAsync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_format",
          "-show_streams",
          "-of",
          "json",
          extractionFixturePath,
        ],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      ),
    ]);
  await writeFile(
    `${extractionFixturePath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-audio-artwork-fixture.mjs",
        bytes: extractionFixtureBytes.byteLength,
        sha256: createHash("sha256")
          .update(extractionFixtureBytes)
          .digest("hex"),
        artwork: {
          codec: "png",
          width: 64,
          height: 64,
          bytes: artworkBytes.byteLength,
          sha256: createHash("sha256").update(artworkBytes).digest("hex"),
        },
        audioCodec: "mp3",
        expectedTags: {
          title: "Within artwork title",
          artist: "Within artist",
          album: "Within album",
          genre: "Test genre",
          date: "2026",
          track: "3/9",
          comment: "Within comment",
        },
        probe: JSON.parse(extractionProbe),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  process.stdout.write(`${fixturePath}\n${extractionFixturePath}\n`);
} finally {
  await rm(workRoot, { recursive: true, force: true });
}
