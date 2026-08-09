import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

const results = await Promise.all([
  runGenerator("scripts/generate-container-webm-stress-fixtures.mjs"),
  runGenerator("scripts/generate-legacy-container-webm-stress-fixtures.mjs"),
]);
for (const stdout of results) process.stdout.write(stdout);

const mp4Path = path.join(
  projectRoot,
  "fixtures",
  "stress",
  "media",
  "h264-aac-128m.mp4",
);
const mkvPath = path.join(
  projectRoot,
  "fixtures",
  "stress",
  "media",
  "h264-aac-128m.mkv",
);
try {
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-i", mp4Path, "-map", "0:v:0", "-map", "0:a:0", "-c", "copy",
      "-map_metadata", "0", "-fflags", "+bitexact", "-f", "matroska",
      mkvPath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  const [fileStat, probeResult, sha256] = await Promise.all([
    stat(mkvPath),
    execFileAsync(
      "ffprobe",
      [
        "-v", "error", "-show_format", "-show_streams", "-show_chapters",
        "-of", "json", mkvPath,
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
    ),
    hashFile(mkvPath),
  ]);
  if (fileStat.size < 128 * 1024 * 1024) {
    throw new Error(
      `Generated h264-aac-128m.mkv is ${fileStat.size} bytes; expected at least 128 MiB.`,
    );
  }
  await writeFile(
    `${mkvPath}.json`,
    `${JSON.stringify({
      generatedBy: "scripts/generate-container-mpegts-stress-fixtures.mjs",
      source: "fixtures/stress/media/h264-aac-128m.mp4",
      bytes: fileStat.size,
      sha256,
      probe: JSON.parse(probeResult.stdout),
    }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${mkvPath}\n`);
} catch (error) {
  await rm(mkvPath, { force: true });
  await rm(`${mkvPath}.json`, { force: true });
  throw error;
}

async function runGenerator(script) {
  const { stdout } = await execFileAsync("node", [script], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
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
