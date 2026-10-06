import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
import { PINNED_DLMALLOC_ROOT, PINNED_SPLIT_DECODER_SHA256 } from "./lib/dlmalloc-free-header-inspection.mjs";
const root = path.resolve(import.meta.dirname, ".."), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const reportPath = "output/playwright/2026-10-06T14-04-50-737Z-split-dlmalloc-static.json";
const raw = await readFile(path.join(root, reportPath)), report = JSON.parse(raw), inspection = report.inspection;
assert.equal(report.failure, null); assert.deepEqual(report.cleanupErrors, []); assert.equal(report.cleanup.runtimeRemoved, true);
await assert.rejects(access(report.runtimeDirectory), { code: "ENOENT" });
assert.equal(report.sourceSha256, sha(await readFile(path.join(root, "scripts/audit-split-dlmalloc-static.mjs"))));
assert.equal(report.originalFileUsed, false); assert.equal(report.wasmFunctionsExecuted, 0); assert.equal(report.conversionsPerformed, 0);
assert.equal(inspection.allocatorRootAddress, PINNED_DLMALLOC_ROOT); assert.equal(inspection.binary.sha256, PINNED_SPLIT_DECODER_SHA256);
const binary = await readFile(path.join(root, inspection.binary.path)); assert.equal(sha(binary), inspection.binary.sha256);
const metadata = readWasmFunctionMetadata(binary, new Set(Object.keys(inspection.selectedFunctions)));
const functions = Object.fromEntries(Object.entries(inspection.selectedFunctions).map(([name, item]) => {
  assert.equal(sha(item.text), item.sha256); assert.equal(Buffer.byteLength(item.text), item.bytes);
  const actual = metadata.find(entry => entry.name === name); assert.deepEqual(item.originalMetadata, actual);
  assert.equal(sha(binary.subarray(actual.bodyStart, actual.bodyEnd)), item.originalBodySha256);
  return [name, { originalMetadata: actual, originalBodySha256: item.originalBodySha256,
    disassembledTextBytes: item.bytes, disassembledTextSha256: item.sha256 }];
}));
const rejectedPath = "output/playwright/2026-10-06T14-02-03-013Z-split-dlmalloc-static.json";
const rejectedRaw = await readFile(path.join(root, rejectedPath)), rejected = JSON.parse(rejectedRaw);
assert.match(rejected.failure, /Static disassembly cap/); assert.equal(rejected.inspection, null);
assert.equal(rejected.cleanup.runtimeRemoved, true); await assert.rejects(access(rejected.runtimeDirectory), { code: "ENOENT" });
const proof = { recordedAt: new Date().toISOString(), scope: "Static exact-binary allocator layout audit only. No original/media/codec/native conversion/Wasm instantiation.",
  publicAcceptance: false, completeChromiumMemoryAcceptance: false, originalFileUsed: false,
  conversionsPerformed: 0, wasmFunctionsExecuted: 0, allocatorFreeSpaceMeasured: false, liveFramesMeasured: false,
  report: { path: reportPath, bytes: raw.length, sha256: sha(raw) },
  rejectedWholeModuleText: { path: rejectedPath, bytes: rejectedRaw.length, sha256: sha(rejectedRaw),
    failure: rejected.failure, executedSourceSha256: rejected.sourceSha256, cleanup: rejected.cleanup },
  actualBinary: inspection.binary, disassembler: inspection.disassembler, analysisOnlySlice: inspection.analysisOnlySlice,
  allocatorRootAddress: inspection.allocatorRootAddress, allocatorLayoutReferences: inspection.allocatorLayoutReferences,
  actualFunctions: functions, primaryAllocatorSource: inspection.primaryAllocatorSource,
  sourcePins: { "scripts/audit-split-dlmalloc-static.mjs": report.sourceSha256,
    "scripts/lib/wasm-static-function-slice.mjs": sha(await readFile(path.join(root, "scripts/lib/wasm-static-function-slice.mjs"))),
    "scripts/lib/wasm-function-metadata.mjs": sha(await readFile(path.join(root, "scripts/lib/wasm-function-metadata.mjs"))) },
  cleanup: report.cleanup, runtimeAndDisassemblerCacheRemoved: true,
  next: "Bounded free-header inventory on the exact unmodified core at failure; no unsafe native allocator call while its mutex may be held." };
await writeFile(path.join(root, "evidence/split-dlmalloc-static-layout-2026-10-06.json"), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log("Frozen actual pinned allocator root/layout/body identities, rejected whole-text approach and owned cleanup.");
