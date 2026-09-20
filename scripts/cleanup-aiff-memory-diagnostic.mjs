import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ["fixtures/stress/media/audio-alac-128m.m4a", "8dd8aecc0ea99610314da8acd6a658a5544450d76fb739ff8c8baeeca9bb6e6e"],
  ["fixtures/stress/media/audio-alac-64m-diagnostic.m4a", "db6effb98e791636d37fc371617ea95ca3bb7bd7f1a4fd8bae5d068b9385c8a6"],
  ["fixtures/stress/media/audio-alac-64m-diagnostic.m4a.json"],
  ["outputs/reports/2026-09-20T07-14-27-048Z-m4a-to-aiff-direct-handle-stress.json", "08b8efdd56cbeabb015ddcbeb2fb499a5dca691c463ca4444469f987764c4874"],
  ["outputs/reports/2026-09-20T07-14-27-048Z-m4a-to-aiff-direct-handle-stress.csv"],
  ["outputs/reports/2026-09-20T07-14-27-048Z-m4a-to-aiff-direct-handle-stress.html"],
  ["outputs/reports/2026-09-20T07-16-08-741Z-m4a-to-aiff-stress.json", "3529cb9f3d5b1f176888da475697dd39c27b63f153cb8bc1e3c0583d260e33fa"],
  ["outputs/reports/2026-09-20T07-16-08-741Z-m4a-to-aiff-stress.csv"],
  ["outputs/reports/2026-09-20T07-16-08-741Z-m4a-to-aiff-stress.html"],
  ["outputs/reports/2026-09-20T07-19-24-634Z-m4a-to-aiff-stress.json", "89b04907c1f894109f11c02df16fbf7fb1691958b11456687c000b766ee1d4c1"],
  ["outputs/reports/2026-09-20T07-19-24-634Z-m4a-to-aiff-stress.csv"],
  ["outputs/reports/2026-09-20T07-19-24-634Z-m4a-to-aiff-stress.html"],
];

function checkedPath(relative) {
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Cleanup target escaped the repository: ${absolute}`);
  }
  return absolute;
}

async function sha256(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file, { highWaterMark: 1024 * 1024 })) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

// Verify every target before removing anything. A changed file is not ours to delete.
for (const [relative, expectedHash] of files) {
  const absolute = checkedPath(relative);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Expected a regular diagnostic file: ${absolute}`);
  }
  if (expectedHash && (await sha256(absolute)) !== expectedHash) {
    throw new Error(`Diagnostic file changed since evidence compaction: ${absolute}`);
  }
}

const tempPath = checkedPath("work/temp-aiff-profile");
if (tempPath !== path.join(root, "work", "temp-aiff-profile")) {
  throw new Error(`Unexpected temporary-directory path: ${tempPath}`);
}
const tempInfo = await lstat(tempPath);
if (!tempInfo.isDirectory() || tempInfo.isSymbolicLink()) {
  throw new Error(`Expected project-local temporary directory: ${tempPath}`);
}

for (const [relative] of files) await rm(checkedPath(relative));
await rm(tempPath, { recursive: true });
process.stdout.write(`Removed ${files.length} exact diagnostic files and project-local temporary data.\n`);
