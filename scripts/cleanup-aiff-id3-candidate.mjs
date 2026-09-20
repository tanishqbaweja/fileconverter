import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = await realpath(path.resolve(import.meta.dirname, ".."));
const reportHashes = new Map([
  ["2026-09-20T02-27-03-761Z-m4a-to-aiff-stress", "95cd9ca5e3f13c00d149d03d3f5d6bc8736dbbe42d51c669678851e15d392105"],
  ["2026-09-20T02-29-49-410Z-m4a-to-aiff-stress", null],
  ["2026-09-20T02-32-10-896Z-m4a-to-aiff-stress", "4690d92293d482e3d635c9e881f4e75b35b137dab5b7029e9e29a9cbc10dc889"],
  ["2026-09-20T02-34-46-607Z-m4a-to-aiff-stress", null],
  ["2026-09-20T02-36-58-450Z-m4a-to-aiff-stress", "5e68f1eb945344838f010a9b95b1cf96d08e986c672fdafd5374725e2ad23dce"],
  ["2026-09-20T02-39-16-644Z-m4a-to-aiff-stress", "a17fe47e3636e8dd1043271e27cee699f69fb9f6554c95a3449550e437a573c0"],
  ["2026-09-20T02-42-02-194Z-m4a-to-aiff-direct-handle-stress", "6cef964cf37a3dd825cc88420e7ee4615e6a14c9547c0380f7ce458219aa5e05"],
  ["2026-09-20T02-43-59-376Z-m4a-to-aiff-direct-handle-stress", "90f65155a8ad8f3e793034c3722b8640e0e0819056158d24a6c34a265eb06ad4"],
]);
const targets = [
  {
    relative: "fixtures/stress/media/audio-alac-128m.m4a",
    kind: "file",
    bytes: 140941469,
    sha256: "8dd8aecc0ea99610314da8acd6a658a5544450d76fb739ff8c8baeeca9bb6e6e",
  },
  {
    relative: "work/aiff-id3-candidate",
    kind: "directory",
    allowedNames: new Set([
      "build-manifest.json", "within-remux.mjs", "within-remux.wasm",
      "LICENSE.lame", "LICENSE.lame-linking", "LICENSE.libogg",
      "LICENSE.libtheora", "LICENSE.libvorbis", "LICENSE.opencore-amr",
      "LICENSE.opus",
    ]),
  },
  {
    relative: "work/aiff-id3-published-backup",
    kind: "directory",
    allowedNames: new Set(["build-manifest.json", "within-remux.wasm"]),
  },
  { relative: "work/temp-aiff-profile", kind: "directory" },
  ...[...reportHashes.keys()].flatMap((base) =>
    ["json", "csv", "html"].map((extension) => ({
      relative: `outputs/reports/${base}.${extension}`,
      kind: "file",
      sha256: extension === "json" ? reportHashes.get(base) : null,
    })),
  ),
];

async function sha256(filePath) {
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
  if (info.isSymbolicLink() ||
      (target.kind === "file" && !info.isFile()) ||
      (target.kind === "directory" && !info.isDirectory()) ||
      (await realpath(absolute)) !== absolute) {
    throw new Error(`Refusing redirected or unexpected target: ${absolute}`);
  }
  if (target.bytes && info.size !== target.bytes) {
    throw new Error(`Unexpected fixture size: ${absolute}`);
  }
  if (target.sha256 && (await sha256(absolute)) !== target.sha256) {
    throw new Error(`Unexpected file hash: ${absolute}`);
  }
  if (target.allowedNames) {
    const unexpected = (await readdir(absolute)).filter(
      (name) => !target.allowedNames.has(name),
    );
    if (unexpected.length > 0) {
      throw new Error(`Unexpected files in ${absolute}: ${unexpected.join(", ")}`);
    }
  }
  checked.push({ absolute, kind: target.kind });
}

for (const { absolute, kind } of checked) {
  await rm(absolute, { recursive: kind === "directory" });
  process.stdout.write(`Removed ${absolute}\n`);
}
