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

await execFileAsync(
  "python",
  [path.join(projectRoot, "scripts", "generate-tiff-extended-fixtures.py")],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);

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
    name: "animated-pattern.avif",
    source: "testsrc2=size=512x384:rate=4",
    frames: 8,
    codecArguments: [
      "-c:v",
      "libaom-av1",
      "-still-picture",
      "0",
      "-cpu-used",
      "8",
      "-crf",
      "30",
    ],
  },
  {
    name: "animated-avif-first-frame-reference.png",
    source: "testsrc2=size=512x384:rate=4",
    codecArguments: ["-c:v", "png"],
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
  {
    name: "test-pattern-deflate.tiff",
    source: "testsrc2=size=1024x768:rate=1",
    codecArguments: [
      "-c:v",
      "tiff",
      "-compression_algo",
      "deflate",
      "-pix_fmt",
      "rgb24",
    ],
  },
  {
    name: "test-pattern-gray-packbits.tiff",
    source: "testsrc2=size=320x240:rate=1,format=gray",
    codecArguments: [
      "-c:v",
      "tiff",
      "-compression_algo",
      "packbits",
      "-pix_fmt",
      "gray",
    ],
  },
  {
    name: "test-pattern-rgba-lzw.tiff",
    source:
      "color=c=red@0.0:size=320x240:rate=1,format=rgba,drawbox=x=80:y=60:w=160:h=120:color=blue@0.5:t=fill",
    codecArguments: [
      "-c:v",
      "tiff",
      "-compression_algo",
      "lzw",
      "-pix_fmt",
      "rgba",
    ],
  },
  {
    name: "test-pattern-palette.tiff",
    source: "testsrc2=size=320x240:rate=1,format=pal8",
    codecArguments: [
      "-c:v",
      "tiff",
      "-compression_algo",
      "raw",
      "-pix_fmt",
      "pal8",
    ],
  },
  {
    name: "decompression-bomb.tiff",
    source: "color=c=black:size=5000x4000:rate=1",
    codecArguments: [
      "-c:v",
      "tiff",
      "-compression_algo",
      "deflate",
      "-pix_fmt",
      "rgb24",
    ],
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
  const probe = JSON.parse(stdout);
  const validationReference =
    fixture.name === "animated-pattern.avif"
      ? "fixtures/images/animated-avif-first-frame-reference.png"
      : undefined;
  if (fixture.name === "animated-pattern.avif") {
    probe.streams[0].nb_frames = "8";
  }
  await writeFile(
    `${fixturePath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-image-fixtures.mjs",
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        probe,
        ...(validationReference ? { validationReference } : {}),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

await execFileAsync(
  "python",
  [path.join(projectRoot, "scripts", "generate-animated-webp-fixture.py")],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);

for (const name of [
  "animated-pattern.webp",
  "animated-pattern-first-frame-reference.png",
  "test-pattern-tiled.tiff",
  "test-pattern-tiled-reference.png",
  "test-pattern-gray16-deflate.tiff",
  "test-pattern-rgb16.tiff",
  "test-pattern-rgba16.tiff",
  "test-pattern-orientation2.tiff",
  "test-pattern-orientation3.tiff",
  "test-pattern-orientation4.tiff",
  "test-pattern-orientation2-reference.png",
  "test-pattern-orientation3-reference.png",
  "test-pattern-orientation4-reference.png",
    "test-pattern-jpeg.tiff",
    "test-pattern-jpeg-reference.png",
    "test-pattern-planar.tiff",
    "test-pattern-planar-reference.png",
    "test-pattern-planar-tiled.tiff",
    "test-pattern-planar-tiled-reference.png",
    "test-pattern-multipage.tiff",
    "test-pattern-multipage-first-page-reference.png",
  "unsupported-orientation5.tiff",
]) {
  const fixturePath = path.join(fixtureRoot, name);
  const bytes = await readFile(fixturePath);
  const { stdout } = await execFileAsync(
    "ffprobe",
    ["-v", "error", "-show_streams", "-show_format", "-of", "json", fixturePath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
  );
  const probe = JSON.parse(stdout);
  let validationReference;
  if (name === "animated-pattern.webp") {
    const referenceName = "animated-pattern-first-frame-reference.png";
    const { stdout: referenceOutput } = await execFileAsync(
      "ffprobe",
      [
        "-v",
        "error",
        "-show_streams",
        "-show_format",
        "-of",
        "json",
        path.join(fixtureRoot, referenceName),
      ],
      { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
    );
    const referenceProbe = JSON.parse(referenceOutput);
    probe.streams[0].width = referenceProbe.streams[0].width;
    probe.streams[0].height = referenceProbe.streams[0].height;
    probe.streams[0].nb_frames = "8";
    validationReference = `fixtures/images/${referenceName}`;
  }
  await writeFile(
    `${fixturePath}.json`,
    `${JSON.stringify(
      {
        generatedBy: name.startsWith("animated-pattern")
          ? "scripts/generate-animated-webp-fixture.py"
          : "scripts/generate-tiff-extended-fixtures.py",
        bytes: bytes.byteLength,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        probe,
        ...(validationReference ? { validationReference } : {}),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
}

const sourceTiff = await readFile(path.join(fixtureRoot, "test-pattern-deflate.tiff"));
for (const derived of [
  {
    name: "truncated.tiff",
    bytes: sourceTiff.subarray(0, Math.min(256, sourceTiff.byteLength)),
    expectation: "rejected truncated TIFF directory or strip data",
  },
  {
    name: "corrupt.tiff",
    bytes: Buffer.from("not-a-tiff-input", "ascii"),
    expectation: "rejected invalid TIFF signature",
  },
]) {
  const fixturePath = path.join(fixtureRoot, derived.name);
  await writeFile(fixturePath, derived.bytes);
  await writeFile(
    `${fixturePath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-image-fixtures.mjs",
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
