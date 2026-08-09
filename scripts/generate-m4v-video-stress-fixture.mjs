import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const fixturePath = path.join(fixtureRoot, "mpeg4-video-128m.m4v");
const manifestPath = `${fixturePath}.json`;
const retainedManifest = await readFile(manifestPath, "utf8").catch((error) => {
  if (error?.code === "ENOENT") return null;
  throw error;
});
const minimumBytes = 128 * 1024 * 1024;
const durationSeconds = 60;
const frameRate = 24;
const expectedFrames = durationSeconds * frameRate;

try {
  await mkdir(fixtureRoot, { recursive: true });
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-f", "lavfi", "-i", `testsrc2=size=1920x1080:rate=${frameRate}:duration=${durationSeconds}`,
      "-map", "0:v:0", "-an", "-c:v", "mpeg4", "-q:v", "2",
      "-g", "48", "-bf", "2", "-pix_fmt", "yuv420p", "-fflags", "+bitexact",
      "-f", "m4v", fixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const fixtureStat = await stat(fixturePath);
  if (fixtureStat.size < minimumBytes) {
    throw new Error(`Generated M4V is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`);
  }
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-of", "json", fixturePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const probe = JSON.parse(stdout);
  const video = probe.streams.find((stream) => stream.codec_type === "video");
  const decodedVideoFrames = Number(video?.nb_read_frames);
  if (
    probe.format?.format_name !== "m4v" ||
    probe.streams.length !== 1 ||
    video?.codec_name !== "mpeg4" ||
    video?.has_b_frames !== 1 ||
    decodedVideoFrames !== expectedFrames
  ) {
    throw new Error("Generated stress fixture is not the expected B-frame M4V stream.");
  }
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      generatedBy: "scripts/generate-m4v-video-stress-fixture.mjs",
      durationSeconds,
      frameRate,
      decodedVideoFrames,
      decodedVideoDurationSeconds: decodedVideoFrames / frameRate,
      bytes: fixtureStat.size,
      sha256: await hashFile(fixturePath),
      probe,
    }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${fixturePath}\n`);
} catch (error) {
  await rm(fixturePath, { force: true });
  if (retainedManifest === null) {
    await rm(manifestPath, { force: true });
  } else {
    await writeFile(manifestPath, retainedManifest, "utf8");
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
