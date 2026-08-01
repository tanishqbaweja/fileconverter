import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const fixtures = [
  {
    source: path.join("fixtures", "compression", "sample.expected.txt"),
    output: path.join("fixtures", "compression", "sample.txt.xz"),
  },
  {
    source: path.join("fixtures", "archives", "sample.tar"),
    output: path.join("fixtures", "archives", "sample.tar.xz"),
  },
  {
    source: path.join("fixtures", "archives", "unsafe-entry.tar"),
    output: path.join("fixtures", "archives", "unsafe-entry.tar.xz"),
  },
];
const python = String.raw`
import lzma, shutil, sys
with open(sys.argv[1], "rb") as source, lzma.open(
    sys.argv[2], "wb", format=lzma.FORMAT_XZ,
    check=lzma.CHECK_CRC64, preset=0
) as target:
    shutil.copyfileobj(source, target, length=262144)
`;

for (const fixture of fixtures) {
  const sourcePath = path.join(projectRoot, fixture.source);
  const outputPath = path.join(projectRoot, fixture.output);
  await execFileAsync("python", ["-c", python, sourcePath, outputPath], {
    cwd: projectRoot,
    windowsHide: true,
    maxBuffer: 1024 * 1024,
  });
  const sourceStat = await stat(sourcePath);
  const outputStat = await stat(outputPath);
  await writeManifest(outputPath, {
    generatedBy: "scripts/generate-xz-fixtures.mjs",
    compressionPreset: 0,
    bytes: outputStat.size,
    sha256: await sha256(outputPath),
    validationBytes: sourceStat.size,
    validationSha256: await sha256(sourcePath),
  });
  process.stdout.write(`${outputPath}\n`);
}

await generateSyntheticFixture({
  name: "expansion-bomb.xz",
  purpose: "XZ expansion-ratio rejection fixture",
  pythonExpression: 'b"\\0" * (2 * 1024 * 1024)',
  preset: 0,
});
await generateSyntheticFixture({
  name: "memory-limit.xz",
  purpose: "XZ decoder memory-limit rejection fixture",
  pythonExpression: 'b"XZ decoder memory limit probe\\n"',
  preset: 9,
});

async function generateSyntheticFixture({
  name,
  purpose,
  pythonExpression,
  preset,
}) {
  const outputPath = path.join(
    projectRoot,
    "fixtures",
    "compression",
    name,
  );
  const generator = String.raw`
import hashlib, json, lzma, sys
source = ${pythonExpression}
encoded = lzma.compress(
    source, format=lzma.FORMAT_XZ, check=lzma.CHECK_CRC64,
    preset=${preset}
)
with open(sys.argv[1], "wb") as target:
    target.write(encoded)
print(json.dumps({"bytes": len(source), "sha256": hashlib.sha256(source).hexdigest()}))
`;
  const { stdout } = await execFileAsync(
    "python",
    ["-c", generator, outputPath],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  const validation = JSON.parse(stdout);
  const outputStat = await stat(outputPath);
  await writeManifest(outputPath, {
    generatedBy: "scripts/generate-xz-fixtures.mjs",
    purpose,
    compressionPreset: preset,
    bytes: outputStat.size,
    sha256: await sha256(outputPath),
    validationBytes: validation.bytes,
    validationSha256: validation.sha256,
  });
  process.stdout.write(`${outputPath}\n`);
}

async function writeManifest(outputPath, manifest) {
  await writeFile(
    `${outputPath}.json`,
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
