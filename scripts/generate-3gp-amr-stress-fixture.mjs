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
const videoFixturePath = path.join(fixtureRoot, "mobile-video-128m.3gp");
const videoManifestPath = `${videoFixturePath}.json`;
const amrSourcePath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "audio-source.amr",
);
const fixturePath = path.join(fixtureRoot, "audio-amr-nb-128m.3gp");
const minimumBytes = 128 * 1024 * 1024;
const durationSeconds = 720;

await Promise.all([
  import("./generate-3gp-stress-fixture.mjs"),
  execFileAsync("node", ["scripts/generate-amr-fixture.mjs"], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  }),
]);
const videoManifest = JSON.parse(await readFile(videoManifestPath, "utf8"));

await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-nostdin",
    "-y",
    "-i",
    videoFixturePath,
    "-stream_loop",
    "-1",
    "-i",
    amrSourcePath,
    "-t",
    String(durationSeconds),
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-map_metadata",
    "-1",
    "-c",
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
    `Generated H.264/AMR 3GP is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`,
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
const video = probe.streams.find((stream) => stream.codec_type === "video");
const audio = probe.streams.find((stream) => stream.codec_type === "audio");
const decodedAudioDurationSeconds =
  (Number(audio?.nb_read_frames) * 160) / Number(audio?.sample_rate);
if (
  !String(probe.format?.format_name).split(",").includes("3gp") ||
  !String(probe.format?.tags?.major_brand).startsWith("3gp") ||
  probe.streams.length !== 2 ||
  video?.codec_name !== "h264" ||
  audio?.codec_name !== "amr_nb" ||
  audio?.sample_rate !== "8000" ||
  audio?.channels !== 1 ||
  !Number.isFinite(decodedAudioDurationSeconds)
) {
  throw new Error("Generated stress fixture is not H.264 video plus 8 kHz mono AMR-NB in 3GP.");
}

const packetHashArguments = (inputPath, stream, inputArguments = []) => [
  "-hide_banner",
  "-loglevel",
  "error",
  "-xerror",
  ...inputArguments,
  "-i",
  inputPath,
  ...(inputArguments.length ? ["-t", String(durationSeconds)] : []),
  "-map",
  `0:${stream}:0`,
  "-c",
  "copy",
  "-f",
  "hash",
  "-hash",
  "sha256",
  "-",
];
const [
  { stdout: sourceVideoPacketHash },
  { stdout: outputVideoPacketHash },
  { stdout: sourceAmrPacketHash },
  { stdout: outputAmrPacketHash },
  { stdout: decodedPcmHash },
] = await Promise.all([
  execFileAsync("ffmpeg", packetHashArguments(videoFixturePath, "v"), {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  }),
  execFileAsync("ffmpeg", packetHashArguments(fixturePath, "v"), {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  }),
  execFileAsync(
    "ffmpeg",
    packetHashArguments(amrSourcePath, "a", ["-stream_loop", "-1"]),
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  ),
  execFileAsync("ffmpeg", packetHashArguments(fixturePath, "a"), {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  }),
  execFileAsync(
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
  ),
]);
const parseHash = (value) => value.trim().split("=")[1];
const compressedPacketSha256 = parseHash(outputAmrPacketHash);
const videoPacketSha256 = parseHash(outputVideoPacketHash);
if (compressedPacketSha256 !== parseHash(sourceAmrPacketHash)) {
  throw new Error("Muxing AMR into 3GP changed the compressed audio stream.");
}
if (videoPacketSha256 !== parseHash(sourceVideoPacketHash)) {
  throw new Error("Replacing the 3GP audio track changed the H.264 video stream.");
}

await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-3gp-amr-stress-fixture.mjs",
    source: "fixtures/stress/media/mobile-video-128m.3gp plus fixtures/media/audio-source.amr",
    sourceVideoSha256: videoManifest.sha256,
    durationSeconds: decodedAudioDurationSeconds,
    decodedAudioDurationSeconds,
    bytes: fixtureStat.size,
    sha256: hash.digest("hex"),
    losslessPcmReference: true,
    decodedPcmSha256: parseHash(decodedPcmHash),
    compressedPacketSha256,
    videoPacketSha256,
    probe,
  }, null, 2)}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
