import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "media");
const fixturePath = path.join(fixtureRoot, "remux-source.mkv");

await mkdir(fixtureRoot, { recursive: true });
await execFileAsync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc2=size=640x360:rate=24",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=997:sample_rate=48000",
    "-t",
    "4",
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-g",
    "48",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-metadata",
    "title=Within deterministic remux fixture",
    "-metadata:s:a:0",
    "language=eng",
    "-fflags",
    "+bitexact",
    "-flags:v",
    "+bitexact",
    "-flags:a",
    "+bitexact",
    fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);

const bytes = await readFile(fixturePath);
const { stdout } = await execFileAsync(
  "ffprobe",
  [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-of",
    "json",
    fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-media-fixture.mjs",
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      probe: JSON.parse(stdout),
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
