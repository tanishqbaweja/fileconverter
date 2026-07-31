import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const fixtures = [
  {
    name: "audio-aac-50m.m4a",
    durationSeconds: 2_100,
    source: "sine=frequency=997:sample_rate=48000",
    codecArguments: ["-c:a", "aac", "-b:a", "192k"],
    losslessPcmReference: false,
  },
  {
    name: "audio-mp3-50m.mp3",
    durationSeconds: 2_100,
    source: "sine=frequency=997:sample_rate=48000",
    codecArguments: ["-c:a", "libmp3lame", "-b:a", "192k"],
    losslessPcmReference: false,
  },
  {
    name: "audio-flac-50m.flac",
    durationSeconds: 600,
    source:
      "anoisesrc=color=white:amplitude=0.25:sample_rate=48000:seed=424242",
    codecArguments: ["-c:a", "flac", "-sample_fmt", "s16"],
    losslessPcmReference: true,
  },
  {
    name: "audio-pcm-192m.wav",
    durationSeconds: 2_100,
    source: "sine=frequency=997:sample_rate=48000",
    codecArguments: ["-c:a", "pcm_s16le"],
    losslessPcmReference: true,
  },
  {
    name: "audio-pcm-192m.aiff",
    durationSeconds: 2_100,
    source: "sine=frequency=997:sample_rate=48000",
    codecArguments: ["-c:a", "pcm_s16be"],
    losslessPcmReference: true,
  },
  {
    name: "audio-vorbis-long.ogg",
    durationSeconds: 2_100,
    source: "sine=frequency=997:sample_rate=48000",
    codecArguments: ["-c:a", "libvorbis", "-q:a", "5"],
    losslessPcmReference: false,
  },
  {
    name: "audio-opus-long.opus",
    durationSeconds: 2_100,
    source: "sine=frequency=997:sample_rate=48000",
    codecArguments: ["-c:a", "libopus", "-b:a", "128k"],
    losslessPcmReference: false,
  },
];

await mkdir(fixtureRoot, { recursive: true });

for (const fixture of fixtures) {
  const fixturePath = path.join(fixtureRoot, fixture.name);
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-nostdin",
      "-y",
      "-f",
      "lavfi",
      "-i",
      fixture.source,
      "-t",
      String(fixture.durationSeconds),
      ...fixture.codecArguments,
      "-metadata",
      "title=Within deterministic large audio fixture",
      "-metadata:s:a:0",
      "language=eng",
      "-fflags",
      "+bitexact",
      "-flags:a",
      "+bitexact",
      fixturePath,
    ],
    {
      cwd: projectRoot,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    },
  );

  const sourceHash = createHash("sha256");
  for await (const chunk of createReadStream(fixturePath)) {
    sourceHash.update(chunk);
  }
  const fixtureStat = await stat(fixturePath);
  const { stdout: probe } = await execFileAsync(
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
    {
      cwd: projectRoot,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  const decodedPcmSha256 = fixture.losslessPcmReference
    ? (
        await execFileAsync(
          "ffmpeg",
          [
            "-hide_banner",
            "-loglevel",
            "error",
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
          {
            cwd: projectRoot,
            windowsHide: true,
            maxBuffer: 8 * 1024 * 1024,
          },
        )
      ).stdout.trim().split("=")[1]
    : null;

  await writeFile(
    `${fixturePath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-audio-stress-fixture.mjs",
        durationSeconds: fixture.durationSeconds,
        bytes: fixtureStat.size,
        sha256: sourceHash.digest("hex"),
        losslessPcmReference: fixture.losslessPcmReference,
        ...(fixture.losslessPcmReference
          ? { decodedPcmSha256 }
          : { minimumDecodedAudioPsnrDb: 60 }),
        probe: JSON.parse(probe),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  process.stdout.write(`${fixturePath}\n`);
}
