import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, realpath, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = await realpath(path.resolve(import.meta.dirname, ".."));
const reportHashes = new Map([
  ["2026-09-20T07-43-42-866Z-m4a-to-aiff-direct-handle-stress", "082416d1a305fb3fbc47ff35e54b484988c67dcab2ef46af55d66426ed83fc2e"],
  ["2026-09-20T07-45-58-881Z-m4a-to-aiff-direct-handle-stress", "78ba28675b1c3d712e11619b2111e4dd8974733c40653945b9112c7b30c760af"],
  ["2026-09-20T07-47-50-443Z-m4a-to-aiff-stress", "5d2cc0200decbb982865d9957a08aa1af35190eefa34f21076069b8aff5516e6"],
  ["2026-09-20T07-51-09-027Z-m4a-to-aiff-direct-handle-stress", "b39ce5540002ce0b0b41015fb1a0157085fde42a3c04528bdb6884859c5841c4"],
  ["2026-09-20T07-52-31-176Z-m4a-to-aiff-stress", "beadf557471d1c16840797ade47168079090bd756406f438525676bbdf3c9102"],
  ["2026-09-20T07-54-20-846Z-m4a-to-aiff-direct-handle-stress", "4959e75229c6ac6e02c0fd974d0a5e379c33da7f49a75ce79a64128a50844ad9"],
  ["2026-09-20T07-55-27-412Z-m4a-to-aiff-stress", "0e6a25dcab0978157423debc87b1ca9498536d4e3fd601f8a1c8a83544834097"],
]);
const targets = [
  {
    relative: "fixtures/stress/media/audio-alac-128m.m4a",
    kind: "file",
    bytes: 140941469,
    sha256: "8dd8aecc0ea99610314da8acd6a658a5544450d76fb739ff8c8baeeca9bb6e6e",
  },
  { relative: "work/aiff-candidate-35497157670", kind: "directory" },
  { relative: "work/playwright-browsers", kind: "directory" },
  { relative: "work/temp-aiff-candidate", kind: "directory" },
  { relative: "output/playwright/artifacts", kind: "directory" },
  { relative: "output/playwright/report", kind: "directory" },
  ...[...reportHashes].flatMap(([base, sha256]) =>
    ["json", "csv", "html"].map((extension) => ({
      relative: `outputs/reports/${base}.${extension}`,
      kind: "file",
      sha256: extension === "json" ? sha256 : null,
    })),
  ),
];

async function digest(filePath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest("hex");
}

const checked = [];
for (const target of targets) {
  const absolute = path.resolve(projectRoot, target.relative);
  const relative = path.relative(projectRoot, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing cleanup outside repository: ${absolute}`);
  }
  const info = await lstat(absolute).catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  if (!info) continue;
  if (
    info.isSymbolicLink() ||
    (target.kind === "file" && !info.isFile()) ||
    (target.kind === "directory" && !info.isDirectory()) ||
    (await realpath(absolute)) !== absolute
  ) {
    throw new Error(`Refusing redirected or unexpected target: ${absolute}`);
  }
  if (target.bytes && info.size !== target.bytes) {
    throw new Error(`Unexpected fixture size: ${absolute}`);
  }
  if (target.sha256 && (await digest(absolute)) !== target.sha256) {
    throw new Error(`Unexpected file hash: ${absolute}`);
  }
  checked.push({ absolute, kind: target.kind });
}

for (const { absolute, kind } of checked) {
  await rm(absolute, { recursive: kind === "directory" });
  process.stdout.write(`Removed ${absolute}\n`);
}
