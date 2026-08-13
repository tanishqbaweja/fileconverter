import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const rawAacPath = path.join(fixtureRoot, "audio-aac-128m.aac");
const rawAacManifestPath = `${rawAacPath}.json`;
const aacM4aPath = path.join(fixtureRoot, "audio-aac-wma-128m.m4a");
const minimumBytes = 128 * 1024 * 1024;

const generatorJobs = [
  ["scripts/generate-aac-stress-fixture.mjs"],
  ["scripts/generate-alac-stress-fixture.mjs", "audio-alac-128m.m4a"],
  [
    "scripts/generate-audio-stress-fixture.mjs",
    "audio-mp3-wma-128m.mp3",
    "audio-pcm-192m.aiff",
  ],
  [
    "scripts/generate-flac-input-stress-fixtures.mjs",
    "audio-vorbis-flac-128m.ogg",
    "audio-opus-flac-128m.opus",
  ],
];
const generationResults = await Promise.all(
  generatorJobs.map((arguments_) =>
    execFileAsync(process.execPath, arguments_, {
      cwd: projectRoot,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }),
  ),
);
for (const result of generationResults) {
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
}

const rawAacManifest = JSON.parse(await readFile(rawAacManifestPath, "utf8"));
const aacM4aDurationSeconds = Number(rawAacManifest.durationSeconds) + 30;
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-stream_loop",
    "1",
    "-i",
    rawAacPath,
    "-t",
    String(aacM4aDurationSeconds),
    "-map",
    "0:a:0",
    "-map_metadata",
    "-1",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    "-fflags",
    "+bitexact",
    "-f",
    "ipod",
    aacM4aPath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);

const fixtureStat = await stat(aacM4aPath);
if (fixtureStat.size < minimumBytes) {
  throw new Error(
    `Generated AAC M4A is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`,
  );
}
const fileHash = createHash("sha256");
for await (const chunk of createReadStream(aacM4aPath, {
  highWaterMark: 4 * 1024 * 1024,
})) {
  fileHash.update(chunk);
}
const { stdout: probeJson } = await execFileAsync(
  "ffprobe",
  [
    "-v",
    "error",
    "-count_frames",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    aacM4aPath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);
const probe = JSON.parse(probeJson);
const audio = probe.streams.find((stream) => stream.codec_type === "audio");
const decodedAudioDurationSeconds =
  (Number(audio?.nb_read_frames) * 1024) / Number(audio?.sample_rate);
if (
  !String(probe.format?.format_name).split(",").includes("m4a") ||
  probe.streams.length !== 1 ||
  audio?.codec_name !== "aac" ||
  audio?.profile !== "LC" ||
  !Number.isFinite(decodedAudioDurationSeconds)
) {
  throw new Error("Generated WMA stress source is not AAC-LC in M4A.");
}

const packetHashArguments = (inputPath, adts, loop = false) => [
  "-hide_banner",
  "-loglevel",
  "error",
  "-xerror",
  ...(loop ? ["-stream_loop", "1"] : []),
  "-i",
  inputPath,
  ...(loop ? ["-t", String(aacM4aDurationSeconds)] : []),
  "-map",
  "0:a:0",
  "-c:a",
  "copy",
  ...(adts ? ["-bsf:a", "aac_adtstoasc"] : []),
  "-f",
  "hash",
  "-hash",
  "sha256",
  "-",
];
const [{ stdout: sourcePacketHash }, { stdout: m4aPacketHash }] =
  await Promise.all([
    execFileAsync("ffmpeg", packetHashArguments(rawAacPath, true, true), {
      cwd: projectRoot,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }),
    execFileAsync("ffmpeg", packetHashArguments(aacM4aPath, false), {
      cwd: projectRoot,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    }),
  ]);
const aacAccessUnitSha256 = m4aPacketHash.trim().split("=")[1];
if (aacAccessUnitSha256 !== sourcePacketHash.trim().split("=")[1]) {
  throw new Error("Remuxing AAC into M4A changed the compressed access units.");
}

await writeFile(
  `${aacM4aPath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-wma-output-stress-fixtures.mjs",
    source: "fixtures/stress/media/audio-aac-128m.aac",
    sourceSha256: rawAacManifest.sha256,
    decodedAudioDurationSeconds,
    durationSeconds: decodedAudioDurationSeconds,
    bytes: fixtureStat.size,
    sha256: fileHash.digest("hex"),
    losslessPcmReference: false,
    minimumDecodedAudioPsnrDb: 60,
    aacAccessUnitSha256,
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${aacM4aPath}\n`);
