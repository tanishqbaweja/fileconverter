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
    name: "test-pattern.png",
    source: "testsrc2=size=1024x768:rate=1",
    codecArguments: ["-c:v", "png"],
  },
  {
    name: "test-pattern.jpg",
    source: "testsrc2=size=1024x768:rate=1",
    codecArguments: ["-c:v", "mjpeg", "-q:v", "2", "-pix_fmt", "yuvj420p"],
  },
  {
    name: "test-pattern.webp",
    source: "testsrc2=size=1024x768:rate=1",
    codecArguments: ["-c:v", "libwebp", "-quality", "90"],
  },
  {
    name: "animated-pattern.gif",
    source: "testsrc2=size=1024x768:rate=4",
    frames: 8,
    codecArguments: ["-c:v", "gif"],
  },
  {
    name: "test-pattern.avif",
    source: "testsrc2=size=1024x768:rate=1",
    codecArguments: [
      "-c:v",
      "libaom-av1",
      "-still-picture",
      "1",
      "-cpu-used",
      "8",
      "-crf",
      "30",
    ],
  },
  {
    name: "test-pattern.bmp",
    source: "testsrc2=size=1024x768:rate=1",
    codecArguments: ["-c:v", "bmp"],
  },
  {
    name: "transparent-pattern.png",
    source:
      "color=c=red@0.0:size=1024x768:rate=1,format=rgba,drawbox=x=256:y=192:w=512:h=384:color=blue@0.5:t=fill",
    codecArguments: ["-c:v", "png"],
  },
  {
    name: "highres-pattern.png",
    source: "testsrc2=size=3840x2160:rate=1",
    codecArguments: ["-c:v", "png"],
  },
  {
    name: "highres-pattern.jpg",
    source: "testsrc2=size=3840x2160:rate=1",
    codecArguments: ["-c:v", "mjpeg", "-q:v", "2", "-pix_fmt", "yuvj420p"],
  },
  {
    name: "highres-pattern.webp",
    source: "testsrc2=size=3840x2160:rate=1",
    codecArguments: ["-c:v", "libwebp", "-quality", "90"],
  },
  {
    name: "highres-pattern.avif",
    source: "testsrc2=size=3840x2160:rate=1",
    codecArguments: [
      "-c:v",
      "libaom-av1",
      "-still-picture",
      "1",
      "-cpu-used",
      "8",
      "-crf",
      "30",
    ],
  },
  {
    name: "highres-pattern.bmp",
    source: "testsrc2=size=3840x2160:rate=1",
    codecArguments: ["-c:v", "bmp"],
  },
  {
    name: "decompression-stress.png",
    source: "color=c=black:size=3840x2160:rate=1",
    codecArguments: ["-c:v", "png"],
  },
];

for (const fixture of fixtures) {
  const fixturePath = path.join(fixtureRoot, fixture.name);
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
      fixture.source,
      "-frames:v",
      String(fixture.frames ?? 1),
      ...fixture.codecArguments,
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
      "-show_streams",
      "-show_format",
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
        generatedBy: "scripts/generate-image-fixtures.mjs",
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        probe: JSON.parse(stdout),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

process.stdout.write(`${fixtureRoot}\n`);
