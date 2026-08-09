import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const startedAt = performance.now();
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const elementaryPath = path.join(fixtureRoot, "mpeg2-video-128m.m2v");
const minimumBytes = 128 * 1024 * 1024;
const containers = [
  { extension: "mkv", format: "matroska" },
  { extension: "mp4", format: "mp4" },
  { extension: "mov", format: "mov" },
  { extension: "avi", format: "avi" },
  { extension: "mpegts", format: "mpegts" },
].map((container) => ({
  ...container,
  filePath: path.join(fixtureRoot, `mpeg2-video-128m.${container.extension}`),
}));
const retainedElementaryManifest = await readFile(`${elementaryPath}.json`, "utf8")
  .catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });

try {
  await execFileAsync(
    "node",
    ["scripts/generate-mpeg2-video-stress-fixture.mjs"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const elementaryManifest = JSON.parse(
    await readFile(`${elementaryPath}.json`, "utf8"),
  );
  const decodedVideoFrames = Number(
    elementaryManifest.decodedVideoFrames ??
      elementaryManifest.probe?.streams?.find(
        (stream) => stream.codec_type === "video",
      )?.nb_read_frames,
  );
  const decodedVideoDurationSeconds = decodedVideoFrames / 25;

  await Promise.all(
    containers.map(({ filePath, format }) =>
      execFileAsync(
        "ffmpeg",
        [
          "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
          "-fflags", "+genpts+bitexact", "-r", String(elementaryManifest.frameRate),
          "-i", elementaryPath, "-map", "0:v:0", "-map_metadata", "-1",
          "-c:v", "copy", "-f", format, filePath,
        ],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      ),
    ),
  );

  await Promise.all(
    containers.map(async ({ filePath }) => {
      const fixtureStat = await stat(filePath);
      if (fixtureStat.size < minimumBytes) {
        throw new Error(
          `Generated ${path.basename(filePath)} is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`,
        );
      }
      const { stdout } = await execFileAsync(
        "ffprobe",
        ["-v", "error", "-show_format", "-show_streams", "-of", "json", filePath],
        { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
      );
      const probe = JSON.parse(stdout);
      if (
        probe.streams.length !== 1 ||
        probe.streams[0]?.codec_type !== "video" ||
        probe.streams[0]?.codec_name !== "mpeg2video"
      ) {
        throw new Error(
          `Generated ${path.basename(filePath)} is not a video-only MPEG-2 container.`,
        );
      }
      await writeFile(
        `${filePath}.json`,
        `${JSON.stringify({
          generatedBy: "scripts/generate-mpeg2-elementary-stress-fixtures.mjs",
          source: "fixtures/stress/media/mpeg2-video-128m.m2v",
          sourceSha256: elementaryManifest.sha256,
          durationSeconds: Number(probe.format?.duration),
          decodedVideoFrames,
          decodedVideoDurationSeconds,
          bytes: fixtureStat.size,
          sha256: await hashFile(filePath),
          probe,
        }, null, 2)}\n`,
        "utf8",
      );
    }),
  );

  process.stdout.write(
    `${[elementaryPath, ...containers.map(({ filePath }) => filePath)].join("\n")}\nGenerated six MPEG-2 stress sources in ${((performance.now() - startedAt) / 1000).toFixed(2)} seconds.\n`,
  );
} catch (error) {
  await Promise.all([
    rm(elementaryPath, { force: true }),
    ...containers.flatMap(({ filePath }) => [
      rm(filePath, { force: true }),
      rm(`${filePath}.json`, { force: true }),
    ]),
  ]);
  if (retainedElementaryManifest === null) {
    await rm(`${elementaryPath}.json`, { force: true });
  } else {
    await writeFile(`${elementaryPath}.json`, retainedElementaryManifest, "utf8");
  }
  throw error;
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath, {
    highWaterMark: 4 * 1024 * 1024,
  })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
