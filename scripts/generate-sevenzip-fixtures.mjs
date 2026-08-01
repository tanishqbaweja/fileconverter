import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, open, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureRoot = path.join(projectRoot, "fixtures", "archives");
const temporaryRoot = path.join(projectRoot, "work", "sevenzip-fixture-temp");

await mkdir(temporaryRoot, { recursive: true });
try {
  await createSampleFixture();
  await convertTarFixture("unsafe-entry.tar", "unsafe-entry.7z");
  await convertTarFixture("many-entries.tar", "many-entries.7z", "copy");
  await convertTarFixture(
    "sample.tar",
    "unsupported-deflate.7z",
    "deflate",
    "7Z unsupported-codec rejection fixture",
  );

  const bombTar = path.join(temporaryRoot, "expansion-bomb.tar");
  const expandedBytes = 2 * 1024 * 1024;
  await writeSingleFileTar(bombTar, "expanded-zeroes.bin", expandedBytes);
  await createSevenZip(bombTar, path.join(fixtureRoot, "expansion-bomb.7z"));
  await writeFixtureManifest(path.join(fixtureRoot, "expansion-bomb.7z"), {
    purpose: "7Z expansion-ratio rejection fixture",
    entries: [
      {
        name: "expanded-zeroes.bin",
        size: expandedBytes,
        sha256: hashZeroes(expandedBytes),
      },
    ],
  });
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function createSampleFixture() {
  const sampleRoot = path.join(temporaryRoot, "sample");
  await mkdir(path.join(sampleRoot, "nested"), { recursive: true });
  await writeFile(path.join(sampleRoot, "hello.txt"), "Within archive fixture.\n");
  await writeFile(
    path.join(sampleRoot, "nested", "data.json"),
    '{"private":true,"uploadBytes":0}\n',
  );
  await writeFile(
    path.join(sampleRoot, "nested", "unicode-café.txt"),
    "Private Unicode archive entry.\n",
  );
  await normalizeFixtureTimes(sampleRoot);
  const outputPath = path.join(fixtureRoot, "sample.7z");
  await execFileAsync(
    "tar",
    [
      "-a",
      "--options",
      "7zip:compression=lzma2",
      "-cf",
      outputPath,
      "-C",
      sampleRoot,
      "hello.txt",
      "nested/data.json",
      "nested/unicode-café.txt",
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  const sourceManifest = JSON.parse(
    await readFile(path.join(fixtureRoot, "sample.tar.json"), "utf8"),
  );
  await writeFixtureManifest(outputPath, { entries: sourceManifest.entries });
}

async function normalizeFixtureTimes(root) {
  const fixed = new Date("2000-01-01T00:00:00.000Z");
  const entries = [root];
  for (const relative of [
    "hello.txt",
    "nested",
    "nested/data.json",
    "nested/unicode-café.txt",
  ]) {
    entries.push(path.join(root, relative));
  }
  const { utimes } = await import("node:fs/promises");
  for (const entry of entries) await utimes(entry, fixed, fixed);
  if (process.platform === "win32") {
    const powershell = [
      "$target=$env:WITHIN_SEVENZIP_FIXTURE_ROOT",
      "$fixed=[DateTime]::SpecifyKind([DateTime]'2000-01-01T00:00:00',[DateTimeKind]::Utc)",
      "$items=@((Get-Item -LiteralPath $target)) + @(Get-ChildItem -LiteralPath $target -Force -Recurse)",
      "$items | ForEach-Object { $_.CreationTimeUtc=$fixed; $_.LastWriteTimeUtc=$fixed; $_.LastAccessTimeUtc=$fixed }",
    ].join("; ");
    await execFileAsync(
      "powershell",
      ["-NoProfile", "-NonInteractive", "-Command", powershell],
      {
        cwd: projectRoot,
        windowsHide: true,
        maxBuffer: 1024 * 1024,
        env: { ...process.env, WITHIN_SEVENZIP_FIXTURE_ROOT: root },
      },
    );
  }
}

async function convertTarFixture(
  sourceName,
  outputName,
  compression = "lzma2",
  purpose,
) {
  const sourcePath = path.join(fixtureRoot, sourceName);
  const outputPath = path.join(fixtureRoot, outputName);
  await createSevenZip(sourcePath, outputPath, compression);
  const sourceManifest = JSON.parse(
    await readFile(`${sourcePath}.json`, "utf8"),
  );
  await writeFixtureManifest(outputPath, {
    requestedCompression: compression,
    ...(purpose ? { purpose } : {}),
    entries: sourceManifest.entries,
  });
}

async function createSevenZip(sourcePath, outputPath, compression = "lzma2") {
  await execFileAsync(
    "tar",
    [
      "-a",
      "--options",
      `7zip:compression=${compression}`,
      "-cf",
      outputPath,
      `@${sourcePath}`,
    ],
    { cwd: projectRoot, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
}

async function writeFixtureManifest(outputPath, extra) {
  const outputStat = await stat(outputPath);
  const manifest = {
    generatedBy: "scripts/generate-sevenzip-fixtures.mjs",
    libarchiveGenerator: "system bsdtar",
    requestedCompression: "lzma2",
    bytes: outputStat.size,
    sha256: await sha256(outputPath),
    ...extra,
  };
  await writeFile(`${outputPath}.json`, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`${outputPath}\n`);
}

async function writeSingleFileTar(outputPath, name, size) {
  const handle = await open(outputPath, "w");
  const header = Buffer.alloc(512);
  writeText(header, 0, 100, name);
  writeOctal(header, 100, 8, 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, 0);
  header.fill(0x20, 148, 156);
  header[156] = 0x30;
  writeText(header, 257, 6, "ustar\0");
  writeText(header, 263, 2, "00");
  const checksum = header.reduce((total, value) => total + value, 0);
  writeOctal(header, 148, 8, checksum);
  const zeroes = Buffer.alloc(64 * 1024);
  try {
    await handle.write(header);
    for (let written = 0; written < size; written += zeroes.byteLength) {
      await handle.write(zeroes, 0, Math.min(zeroes.byteLength, size - written));
    }
    const padding = (512 - (size % 512)) % 512;
    if (padding) await handle.write(Buffer.alloc(padding));
    await handle.write(Buffer.alloc(1024));
  } finally {
    await handle.close();
  }
}

function writeText(buffer, offset, length, value) {
  buffer.write(value, offset, length, "utf8");
}

function writeOctal(buffer, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, "0");
  buffer.write(text, offset, length - 1, "ascii");
  buffer[offset + length - 1] = 0;
}

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

function hashZeroes(bytes) {
  const hash = createHash("sha256");
  const chunk = Buffer.alloc(64 * 1024);
  for (let offset = 0; offset < bytes; offset += chunk.byteLength) {
    hash.update(chunk.subarray(0, Math.min(chunk.byteLength, bytes - offset)));
  }
  return hash.digest("hex");
}
