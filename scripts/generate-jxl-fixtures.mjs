import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtureRoot = path.join(projectRoot, "fixtures", "images");

await mkdir(fixtureRoot, { recursive: true });

const fixtures = [
  {
    name: "test-pattern.jxl",
    source: "test-pattern.png",
    pixelFormat: "rgb24",
  },
  {
    name: "transparent-pattern.jxl",
    source: "transparent-pattern.png",
    pixelFormat: "rgba",
  },
  {
    name: "test-pattern-gray16.jxl",
    source: "test-pattern-gray16-deflate.tiff",
    pixelFormat: "gray16le",
  },
  {
    name: "highres-pattern.jxl",
    source: "highres-pattern.png",
    pixelFormat: "rgb24",
  },
];

for (const fixture of fixtures) {
  const sourcePath = path.join(fixtureRoot, fixture.source);
  const fixturePath = path.join(fixtureRoot, fixture.name);
  await execFileAsync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-threads",
      "1",
      "-i",
      sourcePath,
      "-frames:v",
      "1",
      "-c:v",
      "libjxl",
      "-distance",
      "0",
      "-effort",
      "1",
      "-modular",
      "1",
      "-pix_fmt",
      fixture.pixelFormat,
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
    `${fixturePath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-jxl-fixtures.mjs",
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        probe: JSON.parse(stdout),
        validationReference: `fixtures/images/${fixture.source}`,
        encoding: {
          codec: "libjxl",
          distance: 0,
          effort: 1,
          modular: 1,
          threads: 1,
          pixelFormat: fixture.pixelFormat,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

const sourceJxl = await readFile(path.join(fixtureRoot, "test-pattern.jxl"));
for (const derived of [
  {
    name: "truncated.jxl",
    bytes: sourceJxl.subarray(0, Math.min(128, sourceJxl.byteLength)),
    expectation: "rejected incomplete JPEG XL codestream",
  },
  {
    name: "corrupt.jxl",
    bytes: Buffer.from("not-a-jpeg-xl-input", "ascii"),
    expectation: "rejected invalid JPEG XL signature or codestream",
  },
]) {
  const fixturePath = path.join(fixtureRoot, derived.name);
  await writeFile(fixturePath, derived.bytes);
  await writeFile(
    `${fixturePath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-jxl-fixtures.mjs",
        bytes: derived.bytes.byteLength,
        sha256: createHash("sha256").update(derived.bytes).digest("hex"),
        expectation: derived.expectation,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

process.stdout.write(`${fixtureRoot}\n`);
