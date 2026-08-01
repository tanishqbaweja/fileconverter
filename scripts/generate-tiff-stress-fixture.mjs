import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "stress", "images");
const fixturePath = path.join(fixtureRoot, "tiff-rgb-48m.tiff");
const manifestPath = `${fixturePath}.json`;

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
    "testsrc2=size=8192x2048:rate=1",
    "-frames:v",
    "1",
    "-c:v",
    "tiff",
    "-compression_algo",
    "raw",
    "-pix_fmt",
    "rgb24",
    fixturePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
const bytes = await readFile(fixturePath);
const { stdout } = await execFileAsync(
  "ffprobe",
  ["-v", "error", "-show_streams", "-show_format", "-of", "json", fixturePath],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-tiff-stress-fixture.mjs",
      bytes: (await stat(fixturePath)).size,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      probe: JSON.parse(stdout),
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`${fixturePath}\n`);
