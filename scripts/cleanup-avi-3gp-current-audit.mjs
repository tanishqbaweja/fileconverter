import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = [
  ["fixtures/stress/media/mpeg4-mp3-webm-128m.avi", "8c1f6d00d1f8626386d80bbaa73c9a2618d58ea5be6d5b19a5e517f10e4a85cc"],
  ["fixtures/stress/media/mpeg4-mp3-webm-128m.avi.json", "7be94d116c379933a1b1cd0596d630b4f300cd098bbda9becbc6e079f69798c9"],
  ["outputs/reports/2026-09-21T05-50-03-223Z-avi-to-3gp-direct-handle-stress.csv", "4d0f1240dffea8f4fe63a110f290e3152316f6e99679994cd87d3701fd296b83"],
  ["outputs/reports/2026-09-21T05-50-03-223Z-avi-to-3gp-direct-handle-stress.html", "0187c58d24ffd7c5221d2278404947dc58f1a84b7d41f5f137bf12fc4097fa0f"],
  ["outputs/reports/2026-09-21T05-50-03-223Z-avi-to-3gp-direct-handle-stress.json", "2ea1019b90b7137ae8badad5d07874e6343fef16edff5328e12e2323833dd346"],
  ["outputs/reports/2026-09-21T05-52-31-960Z-avi-to-3gp-direct-handle-stress.csv", "9b7ad70ae48ad48d83735d915c7dade1bff10dfd03d9482ec6d74e4d2b636c16"],
  ["outputs/reports/2026-09-21T05-52-31-960Z-avi-to-3gp-direct-handle-stress.html", "1d6c2f2ff866f161964eb5ed4670a8dd7548f635325926bdf40d88d271ce1ad8"],
  ["outputs/reports/2026-09-21T05-52-31-960Z-avi-to-3gp-direct-handle-stress.json", "b56e6bceac75cb31e9b40825f536cd980d0db8e933ee063103fccf2f5b507045"],
  ["outputs/reports/2026-09-21T05-57-20-069Z-avi-to-3gp-direct-handle-stress.csv", "bc599a73511fcc73de4f856496d44185e444521ffd1cfc59fee614c6ee3010dd"],
  ["outputs/reports/2026-09-21T05-57-20-069Z-avi-to-3gp-direct-handle-stress.html", "ea098b56ede0b184c913e8ce2a9dcf41ca3f258a88837011ae4f8747f1039a20"],
  ["outputs/reports/2026-09-21T05-57-20-069Z-avi-to-3gp-direct-handle-stress.json", "ab89bb40ad941be0517feb3e76aa0384415e596bd559584ffebf3afc9ddbe055"],
  ["outputs/reports/2026-09-21T06-00-39-176Z-avi-to-3gp-direct-handle-stress.csv", "fa96b768784651fe227be6732cf52c575cff68f95d815f630d0c348e6dd432e0"],
  ["outputs/reports/2026-09-21T06-00-39-176Z-avi-to-3gp-direct-handle-stress.html", "a908a516c696da8afc1f1d7958756281a629d84aac02b1cbf3dbcbfd51ecd994"],
  ["outputs/reports/2026-09-21T06-00-39-176Z-avi-to-3gp-direct-handle-stress.json", "561a5f42c7b89e73ee662563c4d1855c61efba1f3630c9668f3ab6f8ed1b94b4"],
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
    throw new Error(`Expected a regular audit file: ${absolute}`);
  }
  if ((await sha256(absolute)) !== expectedHash) {
    throw new Error(`Audit file changed since evidence compaction: ${absolute}`);
  }
}

const tempPath = checkedPath("work/temp-current-chrome");
if (tempPath !== path.join(root, "work", "temp-current-chrome")) {
  throw new Error(`Unexpected temporary-directory path: ${tempPath}`);
}
const tempInfo = await lstat(tempPath);
if (!tempInfo.isDirectory() || tempInfo.isSymbolicLink()) {
  throw new Error(`Expected project-local temporary directory: ${tempPath}`);
}

for (const [relative] of files) await rm(checkedPath(relative));
await rm(tempPath, { recursive: true });
process.stdout.write(`Removed ${files.length} exact audit files and project-local temporary data.\n`);
