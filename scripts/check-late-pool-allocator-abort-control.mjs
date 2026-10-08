// Actual native synthetic control; derivative preserves the audited browser lifecycle.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const sourcePath = "scripts/check-late-pool-abort-control.mjs";
const source = await readFile(path.join(root, sourcePath), "utf8");
const previous = JSON.parse(await readFile(path.join(root, "evidence/late-pool-abort-control-2026-10-08.json")));
assert.equal(sha(source), previous.sourcePins[sourcePath]);
assert.equal(previous.status, "passed-synthetic-abort-control");
const layoutPath = "evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json";
const layoutBytes = await readFile(path.join(root, layoutPath)), layout = JSON.parse(layoutBytes);
assert.equal(layout.status, "actual-link-map-and-compiled-malloc-layout-verified-not-dynamic-free-capacity");
assert.equal(layout.allocatorRootAddress, 1786520);
assert.equal(layout.binary.sha256, previous.exportOnlyControl.originalSha256);
assert.equal(sha(await readFile(path.join(root, layout.binary.path))), layout.binary.sha256);
assert.equal(sha(await readFile(path.join(root, "work/mpeg2-split-pipeline-37739125738/decoder-link.map"))), layout.mapSha256);
assert.equal(sha(await readFile(path.join(root, layout.rawReport.path))), layout.rawReport.sha256);
for (const field of Object.values(layout.allocatorLayoutReferences)) assert.equal(field.referencedInActualFunction, true);
const patches = [
  ['const root = path.resolve(import.meta.dirname, ".."), sha =', `const root = ${JSON.stringify(root)}, sha =`],
  ["evidence/late-pool-abort-control-2026-10-08.json", "evidence/late-pool-allocator-abort-control-2026-10-08.json"],
  ["createLatePoolAbortCapture", "createLatePoolAllocatorAbortCapture"],
  ["late-pool-abort-capture.mjs", "late-pool-allocator-abort-capture.mjs"],
  ['avMallocFunctionIndex:${mallocIndex}});', 'avMallocFunctionIndex:${mallocIndex},actualAllocatorRoot:1786520});'],
  ['"late-pool-allocator-abort-capture.mjs"].map', '"late-pool-allocator-abort-capture.mjs","late-pool-abort-capture.mjs","dlmalloc-free-header-inspection.mjs"].map'],
  ['  assert.equal(terminal.emitted.latePoolRequestUnavailable,null);', `  assert.equal(terminal.emitted.latePoolRequestUnavailable,null);
  assert.equal(terminal.emitted.allocatorFreeBlocksUnavailable,null);
  const inventory=terminal.emitted.allocatorFreeBlocks;
  assert.equal(inventory.complete,true);assert.equal(inventory.heapCopied,false);
  assert.equal(inventory.payloadRead,false);assert.equal(inventory.nativeFunctionsCalled,false);
  assert.equal(inventory.allocatorMutated,false);assert.equal(inventory.fragmentationCauseProven,false);
  assert.ok(inventory.headerWordsRead>0&&inventory.headerWordsRead<=32768);
  assert.ok(inventory.freeChunks>0&&inventory.freeChunks<=4096);
  assert.ok(inventory.totalFreeChunkBytes>=inventory.largestFreeChunkBytes);
  assert.ok(inventory.largestFreeChunkBytes<terminal.syntheticRequestedAllocationBytes);
  assert.equal(terminal.emitted.heapLiveBytes,null);`],
  ['["scripts/check-late-pool-abort-control.mjs",', '["scripts/check-late-pool-allocator-abort-control.mjs", "scripts/check-late-pool-abort-control.mjs", "scripts/lib/late-pool-abort-capture.mjs", "scripts/lib/dlmalloc-free-header-inspection.mjs",'],
  ["  exportOnlyControl, result, snapshots, nativeIdentities, failure,", `  allocatorLayoutProof: {path:${JSON.stringify(layoutPath)},sha256:${JSON.stringify(sha(layoutBytes))},root:1786520}, exportOnlyControl, result, snapshots, nativeIdentities, failure,`],
  ["late-pool-control-driver-", "late-pool-allocator-control-driver-"],
];
let generated = source;
for (const [before, after] of patches) {
  const count = generated.split(before).length - 1;
  assert.equal(count, before === "createLatePoolAbortCapture" ? 2 : before === "late-pool-abort-capture.mjs" ? 3 : 1, before);
  generated = generated.replaceAll(before, after);
}
let reverse = generated;
for (const [before, after] of patches.toReversed()) reverse = reverse.replaceAll(after, before);
assert.equal(reverse, source, "All existing privacy/native-error/heap/birth/cleanup checks preserved");
generated = generated.replace(/from "(\.\/lib\/[^\"]+)"/g,
  (_match, file) => `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
const runtime = await createOwnedRuntimeScratch("late-pool-allocator-control-wrapper-");
try {
  const target = path.join(runtime.directory, "driver.mjs");
  await writeFile(target, generated, { flag: "wx" });
  await import(pathToFileURL(target).href);
} finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
