import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "test.mkv");
const manifestPath = path.join(
  projectRoot,
  "fixtures",
  "media",
  "test-mkv.manifest.json",
);
const sourceStat = await stat(sourcePath);
const hash = createHash("sha256");
for await (const chunk of createReadStream(sourcePath, {
  highWaterMark: 1024 * 1024,
})) {
  hash.update(chunk);
}
const { stdout } = await execFileAsync(
  "ffprobe",
  [
    "-v",
    "error",
    "-show_format",
    "-show_streams",
    "-show_chapters",
    "-of",
    "json",
    sourcePath,
  ],
  { cwd: projectRoot, windowsHide: true, maxBuffer: 16 * 1024 * 1024 },
);
await writeFile(
  manifestPath,
  `${JSON.stringify(
    {
      name: "test.mkv",
      path: sourcePath,
      bytes: sourceStat.size,
      sha256: hash.digest("hex"),
      probe: JSON.parse(stdout),
    },
    null,
    2,
  )}\n`,
  "utf8",
);
process.stdout.write(`${manifestPath}\n`);
