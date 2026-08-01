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
    output: path.join("fixtures", "compression", "sample.txt.bz2"),
  },
  {
    source: path.join("fixtures", "archives", "sample.tar"),
    output: path.join("fixtures", "archives", "sample.tar.bz2"),
  },
  {
    source: path.join("fixtures", "archives", "unsafe-entry.tar"),
    output: path.join("fixtures", "archives", "unsafe-entry.tar.bz2"),
  },
];
const python = String.raw`
import bz2, shutil, sys
with open(sys.argv[1], "rb") as source, bz2.open(sys.argv[2], "wb", compresslevel=9) as target:
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
  await writeFile(
    `${outputPath}.json`,
    `${JSON.stringify(
      {
        generatedBy: "scripts/generate-bzip2-fixtures.mjs",
        bytes: outputStat.size,
        sha256: await sha256(outputPath),
        validationBytes: sourceStat.size,
        validationSha256: await sha256(sourcePath),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  process.stdout.write(`${outputPath}\n`);
}

const expansionBombPath = path.join(
  projectRoot,
  "fixtures",
  "compression",
  "expansion-bomb.bz2",
);
const expansionBombPython = String.raw`
import bz2, sys
with open(sys.argv[1], "wb") as target:
    target.write(bz2.compress(b"\0" * (2 * 1024 * 1024), compresslevel=1))
`;
await execFileAsync("python", ["-c", expansionBombPython, expansionBombPath], {
  cwd: projectRoot,
  windowsHide: true,
  maxBuffer: 1024 * 1024,
});
const expansionBombStat = await stat(expansionBombPath);
const expandedHash = createHash("sha256");
const zeroChunk = Buffer.alloc(256 * 1024);
for (let index = 0; index < 8; index += 1) expandedHash.update(zeroChunk);
await writeFile(
  `${expansionBombPath}.json`,
  `${JSON.stringify(
    {
      generatedBy: "scripts/generate-bzip2-fixtures.mjs",
      purpose: "BZIP2 expansion-ratio rejection fixture",
      bytes: expansionBombStat.size,
      sha256: await sha256(expansionBombPath),
      validationBytes: 2 * 1024 * 1024,
      validationSha256: expandedHash.digest("hex"),
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`${expansionBombPath}\n`);

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
