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
const durationSeconds = 2_300;
const fixtures = [
  {
    name: "audio-pcm-flac-192m.aiff",
    sourceArguments: [
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=997:sample_rate=48000",
    ],
    filterArguments: [],
    codecArguments: ["-c:a", "pcm_s16be"],
    losslessPcmReference: true,
  },
  {
    name: "audio-vorbis-flac-128m.ogg",
    sourceArguments: stereoNoiseSources(),
    filterArguments: [
      "-filter_complex",
      "[0:a][1:a]amerge=inputs=2[a]",
      "-map",
      "[a]",
    ],
    codecArguments: [
      "-c:a",
      "libvorbis",
      "-b:a",
      "500k",
      "-minrate",
      "500k",
      "-maxrate",
      "500k",
    ],
    losslessPcmReference: false,
  },
  {
    name: "audio-opus-flac-128m.opus",
    sourceArguments: stereoNoiseSources(),
    filterArguments: [
      "-filter_complex",
      "[0:a][1:a]amerge=inputs=2[a]",
      "-map",
      "[a]",
    ],
    codecArguments: [
      "-c:a",
      "libopus",
      "-b:a",
      "512k",
      "-vbr",
      "off",
      "-application",
      "audio",
    ],
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
      ...fixture.sourceArguments,
      ...fixture.filterArguments,
      "-t",
      String(durationSeconds),
      ...fixture.codecArguments,
      "-metadata",
      "title=Within deterministic FLAC input stress fixture",
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
  if (fixtureStat.size <= 128 * 1024 * 1024) {
    throw new Error(
      `${fixture.name} is only ${fixtureStat.size} bytes; the stress source must exceed 128 MiB.`,
    );
  }
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
        generatedBy: "scripts/generate-flac-input-stress-fixtures.mjs",
        durationSeconds,
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
  process.stdout.write(`${fixturePath} (${fixtureStat.size} bytes)\n`);
}

function stereoNoiseSources() {
  return [
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=color=white:amplitude=0.25:sample_rate=48000:seed=424242",
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=color=white:amplitude=0.25:sample_rate=48000:seed=242424",
  ];
}
