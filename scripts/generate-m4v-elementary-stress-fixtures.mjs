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
const elementaryPath = path.join(fixtureRoot, "mpeg4-video-128m.m4v");
const audioPath = path.join(projectRoot, "fixtures", "media", "audio-source.m4a");
const minimumBytes = 128 * 1024 * 1024;
const containers = [
  { extension: "mkv", format: "matroska", includeAudio: true },
  { extension: "mp4", format: "mp4", includeAudio: false },
  { extension: "mov", format: "mov", includeAudio: false },
  { extension: "avi", format: "avi", includeAudio: false },
].map((container) => ({
  ...container,
  filePath: path.join(fixtureRoot, `mpeg4-video-128m.${container.extension}`),
}));
const retainedElementaryManifest = await readFile(`${elementaryPath}.json`, "utf8")
  .catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });

try {
  await execFileAsync(
    "node",
    ["scripts/generate-m4v-video-stress-fixture.mjs"],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const elementaryManifest = JSON.parse(
    await readFile(`${elementaryPath}.json`, "utf8"),
  );
  await Promise.all(
    containers.map(({ filePath, format, includeAudio }) =>
      execFileAsync(
        "ffmpeg",
        includeAudio
          ? [
              "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
              "-fflags", "+genpts+bitexact", "-r", String(elementaryManifest.frameRate),
              "-i", elementaryPath, "-stream_loop", "-1", "-i", audioPath,
              "-map", "0:v:0", "-map", "1:a:0", "-map_metadata", "-1",
              "-c", "copy", "-shortest", "-f", format, filePath,
            ]
          : [
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
      const video = probe.streams.find((stream) => stream.codec_type === "video");
      if (video?.codec_name !== "mpeg4" || video?.has_b_frames !== 1) {
        throw new Error(
          `Generated ${path.basename(filePath)} is not an MPEG-4 Part 2 container.`,
        );
      }
      await writeFile(
        `${filePath}.json`,
        `${JSON.stringify({
          generatedBy: "scripts/generate-m4v-elementary-stress-fixtures.mjs",
          source: "fixtures/stress/media/mpeg4-video-128m.m4v",
          sourceSha256: elementaryManifest.sha256,
          durationSeconds: Number(probe.format?.duration),
          decodedVideoFrames: elementaryManifest.decodedVideoFrames,
          decodedVideoDurationSeconds: elementaryManifest.decodedVideoDurationSeconds,
          bytes: fixtureStat.size,
          sha256: await hashFile(filePath),
          probe,
        }, null, 2)}\n`,
        "utf8",
      );
    }),
  );

  process.stdout.write(
    `${[elementaryPath, ...containers.map(({ filePath }) => filePath)].join("\n")}\nGenerated five M4V stress sources in ${((performance.now() - startedAt) / 1000).toFixed(2)} seconds.\n`,
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
