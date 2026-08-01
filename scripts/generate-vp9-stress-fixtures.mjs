import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const protectedSourcePath = path.join(projectRoot, "test.mkv");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "media");
const fixturePath = path.join(fixtureRoot, "matroska-vp9-128m.mkv");
const minimumBytes = 128 * 1024 * 1024;
const excerptSeconds = 900;
const protectedSourceBytes = 2_958_573_265;
const protectedSourceSha256 =
  "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34";

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath, {
    highWaterMark: 4 * 1024 * 1024,
  })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

const protectedSourceStat = await stat(protectedSourcePath);
if (
  protectedSourceStat.size !== protectedSourceBytes ||
  (await sha256(protectedSourcePath)) !== protectedSourceSha256
) {
  throw new Error("The protected root test.mkv does not match its required size and SHA-256.");
}

await Promise.all([
  execFileAsync("node", ["scripts/generate-mpeg2-video-stress-fixture.mjs"], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  }),
  execFileAsync("node", ["scripts/generate-ogv-stress-fixture.mjs"], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 16 * 1024 * 1024,
  }),
]);

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
    "-i", protectedSourcePath, "-t", String(excerptSeconds),
    "-map", "0:v:0", "-map", "0:a:0", "-map", "0:s:0",
    "-c", "copy", "-map_metadata", "0",
    "-fflags", "+bitexact", "-f", "matroska", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);

const fixtureStat = await stat(fixturePath);
if (fixtureStat.size < minimumBytes) {
  throw new Error(
    `Generated MKV is ${fixtureStat.size} bytes; expected at least ${minimumBytes}.`,
  );
}
const { stdout } = await execFileAsync(
  "ffprobe",
  [
    "-v", "error", "-show_format", "-show_streams", "-show_chapters",
    "-of", "json", fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);
const probe = JSON.parse(stdout);
const codecs = probe.streams.map((stream) => stream.codec_name);
if (
  !probe.format?.format_name?.split(",").includes("matroska") ||
  codecs.length !== 3 ||
  codecs[0] !== "hevc" ||
  codecs[1] !== "aac" ||
  codecs[2] !== "subrip"
) {
  throw new Error(`Generated stress fixture is not the expected MKV: ${codecs.join(", ")}.`);
}
const durationSeconds = Number(probe.format.duration);
if (!Number.isFinite(durationSeconds) || Math.abs(durationSeconds - excerptSeconds) > 1) {
  throw new Error(`Generated MKV duration is ${probe.format.duration}; expected ${excerptSeconds}s.`);
}

await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify({
    generatedBy: "scripts/generate-vp9-stress-fixtures.mjs",
    source: "test.mkv (protected; read-only)",
    sourceBytes: protectedSourceBytes,
    sourceSha256: protectedSourceSha256,
    durationSeconds,
    bytes: fixtureStat.size,
    sha256: await sha256(fixturePath),
    probe,
  }, null, 2)}\n`,
  "utf8",
);

const protectedSourceStatAfter = await stat(protectedSourcePath);
if (protectedSourceStatAfter.size !== protectedSourceBytes) {
  throw new Error("The protected root test.mkv size changed while generating fixtures.");
}
process.stdout.write(`${fixturePath}\n`);
