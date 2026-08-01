import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await execFileAsync(
  process.execPath,
  [path.join(projectRoot, "scripts", "generate-archive-fixtures.mjs"), "--include-stress"],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
);

const sourcePath = path.join(
  projectRoot,
  "fixtures",
  "stress",
  "archives",
  "archive-256m.tar",
);
const outputPath = path.join(
  projectRoot,
  "fixtures",
  "stress",
  "archives",
  "archive-256m.7z",
);
await execFileAsync(
  "tar",
  [
    "-a",
    "--options",
    "7zip:compression=copy",
    "-cf",
    outputPath,
    `@${sourcePath}`,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
);
const sourceManifest = JSON.parse(await readFile(`${sourcePath}.json`, "utf8"));
const sourceStat = await stat(sourcePath);
const sourceSha256 = await sha256(sourcePath);
const outputStat = await stat(outputPath);
await writeFile(
  `${outputPath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-sevenzip-stress-fixture.mjs",
      requestedCompression: "copy",
      bytes: outputStat.size,
      sha256: await sha256(outputPath),
      entries: sourceManifest.entries,
    },
    null,
    2,
  )}\n`,
);
const compressedTarOutputs = [
  {
    path: `${sourcePath}.bz2`,
    codec: "bzip2",
    python: String.raw`
import bz2, shutil, sys
with open(sys.argv[1], "rb") as source, bz2.open(sys.argv[2], "wb", compresslevel=1) as target:
    shutil.copyfileobj(source, target, length=262144)
`,
  },
  {
    path: `${sourcePath}.xz`,
    codec: "xz",
    python: String.raw`
import lzma, shutil, sys
with open(sys.argv[1], "rb") as source, lzma.open(
    sys.argv[2], "wb", format=lzma.FORMAT_XZ, check=lzma.CHECK_CRC64, preset=0
) as target:
    shutil.copyfileobj(source, target, length=262144)
`,
  },
];
await Promise.all(
  compressedTarOutputs.map((compressed) =>
    execFileAsync("python", ["-c", compressed.python, sourcePath, compressed.path], {
      cwd: projectRoot,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    }),
  ),
);
for (const compressed of compressedTarOutputs) {
  const compressedStat = await stat(compressed.path);
  await writeFile(
    `${compressed.path}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-sevenzip-stress-fixture.mjs",
        codec: compressed.codec,
        bytes: compressedStat.size,
        sha256: await sha256(compressed.path),
        validationBytes: sourceStat.size,
        validationSha256: sourceSha256,
        entries: sourceManifest.entries,
      },
      null,
      2,
    )}\n`,
  );
}
process.stdout.write(`${outputPath}\n`);

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
