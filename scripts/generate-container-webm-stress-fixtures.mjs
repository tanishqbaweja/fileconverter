import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "test.mkv");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const expectedSourceBytes = 2_958_573_265;
const expectedSourceSha256 =
  "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34";
const minimumBytes = 128 * 1024 * 1024;
const durationSeconds = 65;

await assertProtectedSource();
await mkdir(fixtureRoot, { recursive: true });

for (const fixture of [
  { name: "h264-aac-128m.mp4", format: "mp4", title: "MP4" },
  { name: "h264-aac-128m.mov", format: "mov", title: "QuickTime MOV" },
]) {
  const fixturePath = path.join(fixtureRoot, fixture.name);
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-i", sourcePath, "-t", String(durationSeconds),
      "-map", "0:v:0", "-map", "0:a:0",
      "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
      "-vf", "scale=1282:-2",
      "-b:v", "18M", "-minrate", "18M", "-maxrate", "18M", "-bufsize", "36M",
      "-x264-params", "nal-hrd=cbr:force-cfr=1",
      "-c:a", "copy", "-map_metadata", "0",
      "-metadata", `title=Within deterministic ${fixture.title} WebM stress source`,
      "-fflags", "+bitexact", "-f", fixture.format, fixturePath,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );

  const fixtureStat = await stat(fixturePath);
  if (fixtureStat.size < minimumBytes) {
    throw new Error(
      `Generated ${fixture.name} is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`,
    );
  }
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_format", "-show_streams", "-show_chapters", "-of", "json", fixturePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
  );
  await writeFile(
    `${fixturePath}.json`,
    `${JSON.stringify({
      generatedBy: "scripts/generate-container-webm-stress-fixtures.mjs",
      source: "test.mkv",
      sourceSha256: expectedSourceSha256,
      durationSeconds,
      bytes: fixtureStat.size,
      sha256: await hashFile(fixturePath),
      probe: JSON.parse(stdout),
    }, null, 2)}\n`,
    "utf8",
  );
  process.stdout.write(`${fixturePath}\n`);
}

await assertProtectedSource();

async function assertProtectedSource() {
  const sourceStat = await stat(sourcePath);
  if (sourceStat.size !== expectedSourceBytes) {
    throw new Error(
      `Protected test.mkv size changed: ${sourceStat.size}; expected ${expectedSourceBytes}.`,
    );
  }
  const sha256 = await hashFile(sourcePath);
  if (sha256 !== expectedSourceSha256) {
    throw new Error(`Protected test.mkv SHA-256 changed: ${sha256}.`);
  }
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
