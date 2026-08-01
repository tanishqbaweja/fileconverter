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
process.stdout.write(`${outputPath}\n`);

async function sha256(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}
