import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixturePath = path.join(projectRoot, "fixtures", "media", "webm-source.webm");
const manifestPath = `${fixturePath}.json`;

try {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-f", "lavfi", "-i", "testsrc2=size=320x180:rate=24:duration=2",
      "-f", "lavfi", "-i", "sine=frequency=997:sample_rate=48000:duration=2",
      "-map", "0:v:0", "-map", "1:a:0", "-map_metadata", "-1",
      "-c:v", "libvpx-vp9", "-deadline", "realtime", "-cpu-used", "8",
      "-b:v", "400k", "-g", "48", "-pix_fmt", "yuv420p",
      "-c:a", "libopus", "-b:a", "64k", "-metadata:s:a:0", "language=eng",
      "-f", "webm", fixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-of", "json", fixturePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const probe = JSON.parse(stdout);
  const video = probe.streams?.find((stream) => stream.codec_type === "video");
  const audio = probe.streams?.find((stream) => stream.codec_type === "audio");
  if (
    !probe.format?.format_name?.includes("webm") ||
    video?.codec_name !== "vp9" ||
    video?.width !== 320 ||
    video?.height !== 180 ||
    audio?.codec_name !== "opus" ||
    audio?.sample_rate !== "48000" ||
    audio?.channels !== 1
  ) {
    throw new Error("Generated fixture is not the expected VP9/Opus WebM source.");
  }
  const fixtureStat = await stat(fixturePath);
  await writeFile(
    manifestPath,
    `${JSON.stringify({
      generatedBy: "scripts/generate-webm-source-fixture.mjs",
      bytes: fixtureStat.size,
      sha256: await hashFile(fixturePath),
      probe,
    }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${fixturePath}\n`);
} catch (error) {
  await Promise.all([
    rm(fixturePath, { force: true }),
    rm(manifestPath, { force: true }),
  ]);
  throw error;
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath, { highWaterMark: 256 * 1024 })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}
