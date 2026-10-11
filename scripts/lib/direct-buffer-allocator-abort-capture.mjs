// Failure-only direct AVBuffer allocation observer for the EXACT qualified core.
// Never guess a pool request, allocation size, live heap, or historical cause.
import { createBoundedWasmAbortCapture } from "./bounded-wasm-abort-capture.mjs";
import { inspectDlmallocFreeHeaders } from "./dlmalloc-free-header-inspection.mjs";
export const DIRECT_BUFFER_DECODER_SHA256 = "86704920f30ed243240614df92d05deba9f76c33e739a927903677b677f8a8ec";
export function createDirectBufferAllocatorAbortCapture({ getCore, emit, qualifiedBinarySha256,
  actualAllocatorRoot, avBufferAlloczFunctionIndex, avMallocFunctionIndex, builtinMallocFunctionIndex }) {
  if (typeof getCore !== "function" || typeof emit !== "function" || qualifiedBinarySha256 !== DIRECT_BUFFER_DECODER_SHA256 ||
    actualAllocatorRoot !== 1786520 || avBufferAlloczFunctionIndex !== 4187 || avMallocFunctionIndex !== 4311 || builtinMallocFunctionIndex !== 4435)
    throw new TypeError("Exact qualified direct-buffer/allocator ABI and callbacks required");
  let first = null, emitFailure = null;
  const base = createBoundedWasmAbortCapture({ role: "decoder", emit: row => {
    let inventory = null, unavailable = null, qualifiedCallPath = false;
    try {
      if (row.stackTruncated || row.unavailable || !row.stack ||
        ![avBufferAlloczFunctionIndex, avMallocFunctionIndex, builtinMallocFunctionIndex]
          .every(index => row.stack.includes(`wasm-function[${index}]`)))
        throw new Error("Actual direct-av_buffer_allocz/malloc path unavailable; allocator not read");
      qualifiedCallPath = true;
      inventory = inspectDlmallocFreeHeaders(getCore().HEAPU8, { root: actualAllocatorRoot, expectedBytes: 33554432 });
      inventory = Object.freeze({ ...inventory,
        freeChunkSizeLog2Histogram: Object.freeze(inventory.freeChunkSizeLog2Histogram),
        bins: Object.freeze(inventory.bins.map(entry => Object.freeze(entry))) });
    } catch (error) { unavailable = String(error).slice(0, 512); }
    first = Object.freeze({ ...row, scope: "one-direct-AVBuffer-abort-and-bounded-free-headers-not-original-cause-or-acceptance",
      qualifiedDirectBufferCallPath: qualifiedCallPath, qualifiedBinarySha256,
      allocatorFreeBlocks: inventory, allocatorFreeBlocksUnavailable: unavailable,
      actualAllocatorRoot, maximumAllocatorHeaderWords: 32768, maximumAllocatorFreeChunks: 4096,
      noNativeCallsAtAbort: true, noPayloadRead: true, noHeapCopy: true,
      failedIndividualAllocationBytes: null, heapLiveBytes: null, poolRequest: null,
      fragmentationCauseProven: false, originalFailureCauseProven: false });
    try { emit(first); } catch (error) { emitFailure = String(error).slice(0, 512); }
  } });
  return Object.freeze({ onAbort: base.onAbort, withPriorOnAbort: base.withPriorOnAbort,
    report: () => ({ ...base.report(), first, emitFailure, qualifiedBinarySha256, actualAllocatorRoot,
      maximumAllocatorHeaderWords: 32768, maximumAllocatorFreeChunks: 4096 }) });
}
