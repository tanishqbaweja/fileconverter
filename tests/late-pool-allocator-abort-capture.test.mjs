import assert from "node:assert/strict";
import test from "node:test";
import { createLatePoolAllocatorAbortCapture } from "../scripts/lib/late-pool-allocator-abort-capture.mjs";
function fixture() {
  const heap = new Uint8Array(33554432), view = new DataView(heap.buffer), root = 1786520;
  const set = (at, value) => view.setUint32(at, value, true);
  [0x52504631,1,82,1,8192,33554432,16,33554448,0,0,0,0,4,1,0,0]
    .forEach((word, index) => set(4096 + index * 4, word));
  set(root + 12, 1048568); set(root + 16, 2097152); set(root + 24, 3145728);
  set(3145732, 1048569); set(root + 432, 2097152);
  set(root + 472, 2097152); set(root + 476, 2097152);
  return { core: { HEAPU8: heap, withinRefstructAbortSnapshotAddress: 4096, withinRefstructAbortSnapshotWords: 16 }, set };
}
function qualified(action) {
  const OriginalError = globalThis.Error;
  class SyntheticError extends OriginalError {
    constructor(message) { super(message); this.stack = "SYNTHETIC unit wasm-function[4311] wasm-function[4379]"; }
  }
  globalThis.Error = SyntheticError;
  try { action(OriginalError); } finally { globalThis.Error = OriginalError; }
}
test("failure-only inventory uses explicit actual root and preserves headers, native fatal callback, null live claims", () => qualified(OriginalError => {
  const { core } = fixture(), before = core.HEAPU8.slice(); let reads = 0, emits = 0, row;
  const capture = createLatePoolAllocatorAbortCapture({ getCore: () => { reads++; return core; },
    emit: value => { emits++; row = value; }, poolGetterFunctionIndex: 4379, avMallocFunctionIndex: 4311, actualAllocatorRoot: 1786520 });
  assert.equal(reads, 0); assert.equal(capture.report().first, null);
  const fatal = new OriginalError("prior native fatal callback");
  assert.throws(() => capture.withPriorOnAbort(() => { throw fatal; })("synthetic reason"), error => error === fatal);
  capture.onAbort("duplicate"); assert.equal(reads, 2); assert.equal(emits, 1);
  assert.deepEqual(core.HEAPU8, before);
  assert.equal(row.allocatorFreeBlocksUnavailable, null);
  assert.equal(row.allocatorFreeBlocks.totalFreeChunkBytes, 1048568);
  assert.equal(row.allocatorFreeBlocks.unclaimedMemoryAboveSegmentBytes, 29360128);
  assert.equal(row.allocatorFreeBlocks.freeChunks, 1);
  assert.equal(row.allocatorFreeBlocks.maximumHeaderWords, 32768);
  assert.equal(row.heapLiveBytes, null); assert.equal(row.fragmentationCauseProven, false);
  assert.equal(capture.report().nativeErrorSuppressed, false);
  assert.equal(capture.report().queuedRecords, 0);
  assert.ok(Object.isFrozen(row.allocatorFreeBlocks.bins));
}));
test("unqualified abort never reads core or allocator; invalid/missing root cannot start", () => {
  let reads = 0, previous = false;
  const args = { getCore: () => { reads++; throw new Error("must not read"); }, emit: () => {},
    poolGetterFunctionIndex: 4379, avMallocFunctionIndex: 4311, actualAllocatorRoot: 1786520 };
  const capture = createLatePoolAllocatorAbortCapture(args);
  capture.withPriorOnAbort(() => { previous = true; })("JS-only synthetic abort");
  assert.equal(previous, true); assert.equal(reads, 0);
  assert.equal(capture.report().first.allocatorFreeBlocks, null);
  assert.match(capture.report().first.allocatorFreeBlocksUnavailable, /not read/);
  assert.throws(() => createLatePoolAllocatorAbortCapture({ ...args, actualAllocatorRoot: 1786392 }));
  assert.throws(() => createLatePoolAllocatorAbortCapture({ ...args, actualAllocatorRoot: undefined }));
});
test("corrupt allocator remains unavailable, never zero; emitter failure cannot hide native callback", () => qualified(() => {
  const { core, set } = fixture(); set(3145732, 1048571); let previous = 0;
  const capture = createLatePoolAllocatorAbortCapture({ getCore: () => core,
    emit: () => { throw new Error("synthetic emitter failure"); },
    poolGetterFunctionIndex: 4379, avMallocFunctionIndex: 4311, actualAllocatorRoot: 1786520 });
  capture.withPriorOnAbort(() => { previous++; })("synthetic reason");
  assert.equal(previous, 1); assert.equal(capture.report().first.allocatorFreeBlocks, null);
  assert.match(capture.report().first.allocatorFreeBlocksUnavailable, /state inconsistent/);
  assert.match(capture.report().emitFailure, /emitter failure/);
}));
