import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createRefstructExportOnlyControl } from "../scripts/lib/refstruct-export-only-control.mjs";
import { readWasmFunctionMetadata } from "../scripts/lib/wasm-function-metadata.mjs";
import { readWasmMemoryLimits } from "../scripts/lib/wasm-memory-limits.mjs";
import { createLatePoolAbortCapture } from "../scripts/lib/late-pool-abort-capture.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("synthetic export-only control preserves every code/data/other section and actual function body/type/index", async () => {
  const bytes = await readFile(new URL("../work/mpeg2-split-pipeline-37739125738/within-mpeg2-split.wasm", import.meta.url));
  const control = createRefstructExportOnlyControl(bytes);
  assert.equal(control.controlSha256, "c878501d296ed4deaf1aeff73c7a0736a34601bf733e75e5f0fef74563d900a2");
  assert.equal(control.sections.filter(row => row.originalSha256 !== row.outputSha256).length, 1);
  for (const row of control.sections) if (row.id !== 7) assert.equal(row.originalSha256, row.outputSha256);
  assert.equal(control.syntheticOnly, true); assert.equal(control.usableForMediaOrAcceptance, false);
  assert.equal(control.originalCompiledCoreChanged, false);
  const metadata = readWasmFunctionMetadata(control.binary, new Set(control.selected.map(row => row.name)));
  for (const row of metadata) {
    const original = control.selected.find(entry => entry.name === row.name);
    assert.equal(row.functionIndex, original.functionIndex); assert.deepEqual(row.params, original.params);
    assert.deepEqual(row.results, original.results);
    assert.equal(sha(control.binary.subarray(row.bodyStart, row.bodyEnd)), sha(bytes.subarray(original.bodyStart, original.bodyEnd)));
  }
  assert.deepEqual(readWasmMemoryLimits(control.binary), readWasmMemoryLimits(bytes));
  assert.throws(() => createRefstructExportOnlyControl(control.binary));
  const changed = Buffer.from(bytes); changed[changed.length - 1] ^= 1;
  assert.throws(() => createRefstructExportOnlyControl(changed));
});
function pendingCore() {
  const heap = new Uint8Array(33554432), address = 4096;
  const words = [0x52504631,1,82,1,8192,33554432,16,33554448,0,0,0,0,4,1,0,0];
  const view = new DataView(heap.buffer, address, 64);
  words.forEach((word, index) => view.setUint32(index * 4, word, true));
  return { HEAPU8: heap, withinRefstructAbortSnapshotAddress: address, withinRefstructAbortSnapshotWords: 16 };
}
test("synthetic stack/slot unit captures once, reads only at qualified abort and preserves prior fatal callback", () => {
  const OriginalError = globalThis.Error;
  class SyntheticError extends OriginalError { constructor(message) { super(message); this.stack = "SYNTHETIC unit wasm-function[4311] wasm-function[4379]"; } }
  globalThis.Error = SyntheticError;
  try {
    const core = pendingCore(); let reads = 0, emits = 0, row;
    const capture = createLatePoolAbortCapture({ getCore: () => { reads++; return core; },
      emit: value => { row = value; emits++; }, poolGetterFunctionIndex: 4379, avMallocFunctionIndex: 4311 });
    assert.equal(reads, 0); assert.equal(capture.report().first, null);
    const fatal = new OriginalError("prior fatal callback");
    assert.throws(() => capture.withPriorOnAbort(() => { throw fatal; })("actual reason supplied by synthetic unit"), error => error === fatal);
    capture.onAbort("duplicate"); assert.equal(reads, 1); assert.equal(emits, 1);
    assert.equal(row.latePoolRequest.sequence, 82); assert.equal(row.latePoolRequest.failedIndividualAllocationBytes, 33554448);
    assert.equal(row.noNativeCallsAtAbort, true); assert.equal(row.heapLiveBytes, null);
    assert.equal(row.allocatorFreeBlocks, null); assert.equal(capture.report().queuedRecords, 0);
    assert.equal(capture.report().nativeErrorSuppressed, false);
  } finally { globalThis.Error = OriginalError; }
});
test("unqualified or missing pool state remains unavailable; emitter error cannot replace native callback", () => {
  let read = false, prior = false;
  const capture = createLatePoolAbortCapture({ getCore: () => { read = true; return pendingCore(); },
    emit: () => { throw new Error("synthetic emitter error"); }, poolGetterFunctionIndex: 4379, avMallocFunctionIndex: 4311 });
  capture.withPriorOnAbort(() => { prior = true; })("synthetic JS-only abort, no native pool stack");
  assert.equal(prior, true); assert.equal(read, false); assert.equal(capture.report().first.latePoolRequest, null);
  assert.match(capture.report().first.latePoolRequestUnavailable, /call path unavailable/);
  assert.match(capture.report().emitFailure, /synthetic emitter error/);
  assert.throws(() => createLatePoolAbortCapture({ getCore: () => null, emit: () => {}, poolGetterFunctionIndex: 1, avMallocFunctionIndex: 1 }));
});
