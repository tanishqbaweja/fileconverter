// Browser-only failure observer: one native C slot and bounded allocator HEADERS.
import { createBoundedWasmAbortCapture } from "./bounded-wasm-abort-capture.mjs";
import { inspectDlmallocFreeHeaders } from "./dlmalloc-free-header-inspection.mjs";
export const ALLOCATION_ATTEMPT_DECODER_SHA256 = "417182a9ed0f5e19e77c5248545c80265b87abd477984872d9ccf4094d8b1014";
export const ALLOCATION_ATTEMPT_SLOT = 1918736, ALLOCATION_ATTEMPT_ROOT = 1786648;
export function readAllocationAttemptSnapshot(core) {
  if (!(core?.HEAPU8 instanceof Uint8Array) || core.HEAPU8.byteLength !== 33554432 ||
    core.withinAllocatorAttemptAddress !== ALLOCATION_ATTEMPT_SLOT || core.withinAllocatorAttemptWords !== 16)
    throw new Error("Qualified fixed heap/constructor slot binding unavailable");
  const view = new DataView(core.HEAPU8.buffer, core.HEAPU8.byteOffset, core.HEAPU8.byteLength);
  const words = Array.from({ length: 16 }, (_, index) => view.getUint32(ALLOCATION_ATTEMPT_SLOT + index * 4, true));
  if (words[0] !== 1095519281 || words[1] !== 1 || words[2] === 0 || ![1, 4].includes(words[3]) ||
    words[4] !== 16 || words[5] === 0 || words[6] !== 0 || words[8] !== 0 || words[9] !== (words[7] & 15) ||
    ![0, 1].includes(words[10]) || words.slice(11).some(value => value !== 0))
    throw new Error("Current pending allocation snapshot schema/state unavailable");
  if (words[3] === 1 && (words[5] < 262144 || words.slice(7, 11).some(value => value !== 0)))
    throw new Error("Fast allocation phase inconsistent");
  if (words[3] === 4 && (words[7] >= core.HEAPU8.byteLength ||
    (words[7] !== 0 && (words[9] !== 8 || words[10] !== 1)) || (words[7] === 0 && words[10] !== 0)))
    throw new Error("Aligned fallback ownership/state inconsistent");
  return Object.freeze({ scope: "native-wrapper-request-and-pending-phase-not-internal-chunk-size-or-live-heap",
    words: Object.freeze(words), wordsRead: 16, slotBytes: 64, sequence: words[2],
    phase: words[3] === 1 ? "fast-malloc-pending" : "upstream-alignment-pending",
    wrapperRequestedBytes: words[5], alignment: words[4], freshUnexposedPointerFreed: words[10] === 1,
    completed: false, allocatorInternalChunkBytes: null,
    failedIndividualAllocationBytes: words[3] === 1 ? words[5] : null });
}
export function createAllocationAttemptAbortCapture({ getCore, emit, qualifiedBinarySha256,
  actualAllocatorRoot = ALLOCATION_ATTEMPT_ROOT, avBufferAlloczFunctionIndex = 4188,
  avMallocFunctionIndex = 4312, builtinMallocFunctionIndex = 4436 }) {
  if (typeof getCore !== "function" || typeof emit !== "function" || qualifiedBinarySha256 !== ALLOCATION_ATTEMPT_DECODER_SHA256 ||
    actualAllocatorRoot !== ALLOCATION_ATTEMPT_ROOT || avBufferAlloczFunctionIndex !== 4188 ||
    avMallocFunctionIndex !== 4312 || builtinMallocFunctionIndex !== 4436)
    throw new TypeError("Exact compiled attempt-slot ABI and callbacks required");
  let first = null, emitFailure = null;
  const base = createBoundedWasmAbortCapture({ role: "decoder", emit: row => {
    let attempt = null, attemptUnavailable = null, inventory = null, inventoryUnavailable = null, qualified = false;
    try {
      if (row.stackTruncated || row.unavailable || !row.stack ||
        ![4188, 4312, 4471, 4441].every(index => row.stack.includes(`wasm-function[${index}]`)))
        throw new Error("Actual AVBuffer/wrapper/sbrk path unavailable; heap not read");
      qualified = true;
      const core = getCore();
      attempt = readAllocationAttemptSnapshot(core);
      try {
        const value = inspectDlmallocFreeHeaders(core.HEAPU8, { root: ALLOCATION_ATTEMPT_ROOT, expectedBytes: 33554432 });
        inventory = Object.freeze({ ...value, freeChunkSizeLog2Histogram: Object.freeze(value.freeChunkSizeLog2Histogram),
          bins: Object.freeze(value.bins.map(entry => Object.freeze(entry))) });
      } catch (error) { inventoryUnavailable = String(error).slice(0, 512); }
    } catch (error) { attemptUnavailable = String(error).slice(0, 512); inventoryUnavailable = "Qualified allocation snapshot unavailable; allocator not read"; }
    first = Object.freeze({ ...row, scope: "one-current-native-allocation-attempt-and-bounded-free-headers-not-original-cause-or-acceptance",
      qualifiedDirectBufferCallPath: qualified, qualifiedBinarySha256, allocationAttempt: attempt,
      allocationAttemptUnavailable: attemptUnavailable, allocatorFreeBlocks: inventory, allocatorFreeBlocksUnavailable: inventoryUnavailable,
      failedIndividualAllocationBytes: attempt?.failedIndividualAllocationBytes ?? null,
      wrapperRequestedBytes: attempt?.wrapperRequestedBytes ?? null, heapLiveBytes: null, poolRequest: null,
      actualAllocatorRoot: ALLOCATION_ATTEMPT_ROOT, actualAttemptSlotAddress: ALLOCATION_ATTEMPT_SLOT,
      maximumSlotWords: 16, maximumAllocatorHeaderWords: 32768, maximumAllocatorFreeChunks: 4096,
      noNativeCallsAtAbort: true, noPayloadRead: true, noHeapCopy: true,
      fragmentationCauseProven: false, originalFailureCauseProven: false });
    try { emit(first); } catch (error) { emitFailure = String(error).slice(0, 512); }
  } });
  return Object.freeze({ onAbort: base.onAbort, withPriorOnAbort: base.withPriorOnAbort,
    report: () => ({ ...base.report(), first, emitFailure, qualifiedBinarySha256,
      actualAllocatorRoot: ALLOCATION_ATTEMPT_ROOT, actualAttemptSlotAddress: ALLOCATION_ATTEMPT_SLOT, maximumSlotWords: 16 }) });
}

