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
const fixturePath = path.join(fixtureRoot, "avi-theora-128m.avi");
const durationSeconds = 20;
const minimumBytes = 128 * 1024 * 1024;
const maximumBytes = 192 * 1024 * 1024;

await mkdir(fixtureRoot, { recursive: true });
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
    "cellauto=size=1920x1080:rate=24:rule=110",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=997:sample_rate=48000",
    "-t",
    String(durationSeconds),
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "mpeg4",
    "-q:v",
    "1",
    "-threads:v",
    "1",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    "-fflags",
    "+bitexact",
    "-flags:v",
    "+bitexact",
    "-flags:a",
    "+bitexact",
    "-map_metadata",
    "-1",
    "-f",
    "avi",
    fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
if (fixtureStat.size < minimumBytes || fixtureStat.size > maximumBytes) {
  throw new Error(
    `Generated AVI is ${fixtureStat.size} bytes; expected ${minimumBytes}-${maximumBytes}.`,
  );
}

const digest = createHash("sha256");
for await (const chunk of createReadStream(fixturePath, {
  highWaterMark: 4 * 1024 * 1024,
})) {
  digest.update(chunk);
}
const { stdout } = await execFileAsync(
  "ffprobe",
  [
    "-v",
    "error",
    "-count_frames",
    "-count_packets",
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
if (
  !String(probe.format?.format_name ?? "").split(",").includes("avi") ||
  video?.codec_name !== "mpeg4" ||
  video?.width !== 1920 ||
  video?.height !== 1080 ||
  audio?.codec_name !== "mp3"
) {
  throw new Error("Generated stress fixture is not 1920x1080 MPEG-4/MP3 AVI.");
}
const decodedVideoFrames = Number(video.nb_read_frames);
const decodedVideoDurationSeconds = decodedVideoFrames / 24;
if (
  decodedVideoFrames !== durationSeconds * 24 ||
  !Number.isFinite(decodedVideoDurationSeconds)
) {
  throw new Error(
    `Generated AVI decoded ${decodedVideoFrames} frames; expected ${durationSeconds * 24}.`,
  );
}

await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-avi-ogv-stress-fixture.mjs",
      purpose:
        "High-entropy short-duration AVI for the private AVI-to-OGV large-input gate.",
      durationSeconds,
      decodedVideoDurationSeconds,
      decodedVideoFrames,
      bytes: fixtureStat.size,
      sha256: digest.digest("hex"),
      probe,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
