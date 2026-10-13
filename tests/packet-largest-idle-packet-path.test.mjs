// Synthetic stack/heap unit controls ONLY, not a reproduced browser packet abort.
import assert from "node:assert/strict";
import test from "node:test";
import { createCompositeAllocationAbortCapture } from "../scripts/lib/packet-largest-idle-composite-abort-capture.mjs";
import { ALLOCATION_ATTEMPT_DECODER_SHA256, ALLOCATION_ATTEMPT_ROOT, ALLOCATION_ATTEMPT_SLOT } from "../scripts/lib/packet-largest-idle-attempt-abort-capture.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
function fixture() {
  const heap = new Uint8Array(33554432), view = new DataView(heap.buffer), set = (at, value) => view.setUint32(at, value, true);
  set(ALLOCATION_ATTEMPT_ROOT + 12, 1048568); set(ALLOCATION_ATTEMPT_ROOT + 16, 2097152);
  set(ALLOCATION_ATTEMPT_ROOT + 24, 3145728); set(3145732, 1048569);
  for (const offset of [432, 472, 476]) set(ALLOCATION_ATTEMPT_ROOT + offset, 2097152);
  [1095519281,1,23,1,16,314088].forEach((word, index) => set(ALLOCATION_ATTEMPT_SLOT + index * 4, word));
  return { core: { HEAPU8: heap, withinAllocatorAttemptAddress: ALLOCATION_ATTEMPT_SLOT, withinAllocatorAttemptWords: 16 }, set };
}
function stack(indices, action) {
  const original = globalThis.Error;
  class SyntheticError extends original {
    constructor(message) { super(message); this.stack = "SYNTHETIC UNIT ONLY " + indices.map(index => `wasm-function[${index}]`).join(" "); }
  }
  globalThis.Error = SyntheticError; try { action(original); } finally { globalThis.Error = original; }
}
const packet = [4471,4313,4473,4442];
test("packet-path unit capture reads exactly pending16-word slot/bounded headers once, preserves fatal and heap", () => stack(packet, ErrorClass => {
  const { core } = fixture(), before = sha(core.HEAPU8); let gets = 0, emits = 0, prior = 0;
  const observer = createCompositeAllocationAbortCapture({ getCore: () => { gets++; return core; }, emit: () => { emits++; }, qualifiedBinarySha256: ALLOCATION_ATTEMPT_DECODER_SHA256 });
  assert.equal(gets, 0); const fatal = new ErrorClass("unchanged native fatal");
  assert.throws(() => observer.withPriorOnAbort(() => { prior++; throw fatal; })("synthetic"), error => error === fatal);
  observer.onAbort("duplicate"); assert.equal(gets, 1); assert.equal(emits, 1); assert.equal(prior, 1); assert.equal(sha(core.HEAPU8), before);
  const row = observer.report().first; assert.equal(row.qualifiedPacketCallPath, true);
  assert.equal(row.qualifiedDirectBufferCallPath, false); assert.equal(row.qualifiedPoolCallPath, false);
  assert.equal(row.failedIndividualAllocationBytes, 314088); assert.equal(row.wrapperRequestedBytes, 314088);
  assert.equal(row.validatedScalarWords, 16); assert.equal(row.allocatorFreeBlocks.headerWordsRead, 44);
  assert.equal(row.originalFailureCauseProven, false); assert.equal(row.fragmentationCauseProven, false);
  assert.equal(row.heapLiveBytes, null); assert.equal(row.noNativeCallsAtAbort, true); assert.equal(row.noPayloadRead, true);
}));
test("packet upstream-alignment request is retained without inventing exact internal failed allocation bytes", () => stack(packet, () => {
  const { core, set } = fixture(); set(ALLOCATION_ATTEMPT_SLOT + 12, 4); set(ALLOCATION_ATTEMPT_SLOT + 20, 8192);
  const observer = createCompositeAllocationAbortCapture({ getCore: () => core, emit: () => {}, qualifiedBinarySha256: ALLOCATION_ATTEMPT_DECODER_SHA256 });
  observer.onAbort("synthetic"); const row = observer.report().first;
  assert.equal(row.wrapperRequestedBytes, 8192); assert.equal(row.failedIndividualAllocationBytes, null);
  assert.equal(row.allocationAttempt.phase, "upstream-alignment-pending");
}));
test("stale packet slot cannot establish request or free-heap inventory", () => stack(packet, () => {
  const { core, set } = fixture(); set(ALLOCATION_ATTEMPT_SLOT + 12, 6);
  const observer = createCompositeAllocationAbortCapture({ getCore: () => core, emit: () => {}, qualifiedBinarySha256: ALLOCATION_ATTEMPT_DECODER_SHA256 });
  observer.onAbort("synthetic"); const row = observer.report().first;
  assert.equal(row.allocationAttempt, null); assert.equal(row.failedIndividualAllocationBytes, null); assert.equal(row.allocatorFreeBlocks, null);
  assert.equal(row.validatedScalarWords, 0);
}));
test("incomplete/unknown packet call path never reads heap or diagnostic slots", () => stack([4471,4313,4442], () => {
  let gets = 0;
  const observer = createCompositeAllocationAbortCapture({ getCore: () => { gets++; throw new Error("must not read"); }, emit: () => {}, qualifiedBinarySha256: ALLOCATION_ATTEMPT_DECODER_SHA256 });
  observer.onAbort("synthetic"); assert.equal(gets, 0); assert.equal(observer.report().first.qualifiedPacketCallPath, false);
  assert.equal(observer.report().first.allocationAttempt, null);
}));
