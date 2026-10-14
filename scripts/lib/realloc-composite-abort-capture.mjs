// One fatal-only typed call path +16 scalar words + bounded free HEADERS.
import { createBoundedWasmAbortCapture } from "./bounded-wasm-abort-capture.mjs";
import { inspectDlmallocFreeHeaders } from "./dlmalloc-free-header-inspection.mjs";
import { readPendingReallocAttempt, REALLOC_DECODER_SHA256, REALLOC_SLOT, REALLOC_ALLOCATOR_ROOT } from "./realloc-attempt-abort-capture.mjs";
export function createReallocAbortCapture({ getCore, emit, qualifiedBinarySha256 }) {
  if (typeof getCore !== "function" || typeof emit !== "function" || qualifiedBinarySha256 !== REALLOC_DECODER_SHA256)
    throw new TypeError("Qualified exact realloc decoder and explicit callbacks required");
  let first = null, emitFailure = null;
  const base = createBoundedWasmAbortCapture({ role: "decoder", emit: row => {
    const available = !row.stackTruncated && !row.unavailable && typeof row.stack === "string";
    const has = index => available && row.stack.includes(`wasm-function[${index}]`);
    const reallocPath = [4475,4440,4437,4442].every(has), bufferPath = reallocPath && [4474,4192].every(has);
    let request = null, inventory = null, requestUnavailable = "Qualified actual realloc call path unavailable; slot not read";
    let inventoryUnavailable = "Qualified current realloc request unavailable; allocator not read";
    if (reallocPath) {
      try {
        const core = getCore();
        request = readPendingReallocAttempt(core);
        if (request.outerBufferScope && !bufferPath) throw new Error("Outer AVBuffer scope without qualified actual outer call stack");
        requestUnavailable = null;
        try {
          const value = inspectDlmallocFreeHeaders(core.HEAPU8, { root: REALLOC_ALLOCATOR_ROOT, expectedBytes: 33554432 });
          inventory = Object.freeze({ ...value, freeChunkSizeLog2Histogram: Object.freeze(value.freeChunkSizeLog2Histogram),
            bins: Object.freeze(value.bins.map(x => Object.freeze(x))) }); inventoryUnavailable = null;
        } catch (error) { inventoryUnavailable = String(error).slice(0,512); }
      } catch (error) { request = null; requestUnavailable = String(error).slice(0,512); }
    }
    first = Object.freeze({ ...row, scope: "one-current-realloc-api-request-and-bounded-free-headers-not-cause-or-acceptance",
      qualifiedBinarySha256, qualifiedReallocCallPath: reallocPath, qualifiedBufferReallocCallPath: bufferPath,
      reallocAttempt: request, reallocAttemptUnavailable: requestUnavailable, allocationApiRequestedBytes: request?.allocationApiRequestedBytes ?? null,
      failedIndividualAllocationBytes: null, heapLiveBytes: null, allocatorFreeBlocks: inventory, allocatorFreeBlocksUnavailable: inventoryUnavailable,
      actualAllocatorRoot: REALLOC_ALLOCATOR_ROOT, actualReallocSlotAddress: REALLOC_SLOT, validatedScalarWords: request ? 16 : 0,
      maximumScalarWords: 16, maximumAllocatorHeaderWords: 32768, maximumAllocatorFreeChunks: 4096,
      noNativeCallsAtAbort: true, noPayloadRead: true, noHeapCopy: true, fragmentationCauseProven: false, originalFailureCauseProven: false });
    try { emit(first); } catch (error) { emitFailure = String(error).slice(0,512); }
  } });
  return Object.freeze({ onAbort: base.onAbort, withPriorOnAbort: base.withPriorOnAbort,
    report: () => ({ ...base.report(), first, emitFailure, qualifiedBinarySha256, maximumScalarWords: 16 }) });
}
