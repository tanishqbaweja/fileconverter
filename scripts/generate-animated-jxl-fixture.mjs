import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoot = path.join(projectRoot, "fixtures", "images");
const sourcePath = path.join(fixtureRoot, "animated-pattern.gif");
const fixturePath = path.join(fixtureRoot, "animated-pattern.jxl");
const releaseUrl =
  "https://github.com/libjxl/libjxl/releases/download/v0.12.0/jxl-x64-windows-static.zip";
const releaseSha256 =
  "3025d7e308390796d20492322e606bc92decaee7b6bc99d3f7547870ae5db7de";

const candidates = [
  process.env.WITHIN_CJXL,
  path.join(
    projectRoot,
    "work",
    "jxl-fixture-tool",
    "x64-windows-static",
    "bin",
    "cjxl.exe",
  ),
  "cjxl",
].filter(Boolean);

let cjxl = null;
let version = "";
for (const candidate of candidates) {
  try {
    const result = await execFileAsync(candidate, ["--version"], {
      cwd: projectRoot,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
    if (!/cjxl v0\.12\.0\b/.test(result.stdout)) {
      throw new Error(`Expected cjxl v0.12.0, received: ${result.stdout.trim()}`);
    }
    cjxl = candidate;
    version = result.stdout.trim();
    break;
  } catch (error) {
    if (candidate === candidates.at(-1)) throw error;
  }
}
if (!cjxl) {
  throw new Error(
    "Pinned cjxl v0.12.0 was not found. Set WITHIN_CJXL to its executable.",
  );
}

await execFileAsync(
  cjxl,
  [
    sourcePath,
    fixturePath,
    "--distance=0",
    "--effort=1",
    "--num_threads=1",
  ],
  {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  },
);

const bytes = await readFile(fixturePath);
const { stdout } = await execFileAsync(
  "ffprobe",
  [
    "-v",
    "error",
    "-count_frames",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    fixturePath,
  ],
  {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 8 * 1024 * 1024,
  },
);
const probe = JSON.parse(stdout);
const stream = probe.streams?.[0];
if (
  stream?.codec_name !== "jpegxl_anim" ||
  stream.width !== 1024 ||
  stream.height !== 768 ||
  Number(stream.nb_read_frames) !== 8
) {
  throw new Error("Generated JPEG XL fixture failed its independent frame probe.");
}

await writeFile(
  `${fixturePath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-animated-jxl-fixture.mjs",
      bytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      frameCount: 8,
      probe,
      validationReference: "fixtures/images/animated-pattern.gif",
      encoding: {
        tool: version,
        libjxlVersion: "0.12.0",
        distance: 0,
        effort: 1,
        threads: 1,
        sourceFrames: 8,
        sourceFrameDurationMilliseconds: 250,
        releaseUrl,
        releaseSha256,
      },
    },
    null,
    2,
  )}\n`,
  "utf8",
);

process.stdout.write(`${fixturePath}\n`);
