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

await execFileAsync(
  process.execPath,
  [path.join(projectRoot, "scripts", "generate-stress-fixture.mjs"), "256"],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);
await execFileAsync(
  process.execPath,
  [
    path.join(projectRoot, "scripts", "generate-archive-fixtures.mjs"),
    "--include-stress",
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
);

const sources = [
  path.join(projectRoot, "fixtures", "stress", "deterministic-256m.bin"),
  path.join(
    projectRoot,
    "fixtures",
    "stress",
    "archives",
    "archive-256m.tar",
  ),
];
const python = String.raw`
import lzma, shutil, sys
with open(sys.argv[1], "rb") as source, lzma.open(
    sys.argv[2], "wb", format=lzma.FORMAT_XZ, check=lzma.CHECK_CRC64, preset=0
) as target:
    shutil.copyfileobj(source, target, length=262144)
`;

await Promise.all(sources.map(async (sourcePath) => {
  const outputPath = `${sourcePath}.xz`;
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
        generatedBy: "scripts/generate-xz-stress-fixtures.mjs",
        compressionPreset: 0,
        integrityCheck: "CRC64",
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
  process.stdout.write(`${outputPath} (${outputStat.size} bytes)\n`);
}));

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
