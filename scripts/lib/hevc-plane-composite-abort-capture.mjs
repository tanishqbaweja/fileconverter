// One failure-only stack, current C slots and bounded free HEADERS. No polling.
import { createBoundedWasmAbortCapture } from "./bounded-wasm-abort-capture.mjs";
import { readAllocationAttemptSnapshot, ALLOCATION_ATTEMPT_DECODER_SHA256, ALLOCATION_ATTEMPT_ROOT, ALLOCATION_ATTEMPT_SLOT } from "./hevc-plane-attempt-abort-capture.mjs";
import { readLateRefstructAbortSnapshot } from "./late-refstruct-abort-snapshot.mjs";
import { inspectDlmallocFreeHeaders } from "./dlmalloc-free-header-inspection.mjs";
export const COMPOSITE_POOL_SLOT = 1918800;
export function createCompositeAllocationAbortCapture({ getCore, emit, qualifiedBinarySha256 }) {
  if (typeof getCore !== "function" || typeof emit !== "function" || qualifiedBinarySha256 !== ALLOCATION_ATTEMPT_DECODER_SHA256)
    throw new TypeError("Exact compiled allocation-attempt decoder and callbacks required");
  let first = null, emitFailure = null;
  const base = createBoundedWasmAbortCapture({ role: "decoder", emit: row => {
    const available = !row.stackTruncated && !row.unavailable && typeof row.stack === "string";
    const has = index => available && row.stack.includes(`wasm-function[${index}]`);
    const directPath = [4188, 4313, 4472, 4442].every(has), poolPath = [4381, 4313].every(has);
    let attempt = null, request = null, inventory = null;
    let attemptUnavailable = "Qualified wrapper/AVBuffer path unavailable; attempt slot not read";
    let requestUnavailable = "Qualified pool-get/av_malloc path unavailable; pool slot not read";
    let inventoryUnavailable = "Qualified current request unavailable; allocator not read";
    let validatedScalarWords = 0;
    if (directPath || poolPath) {
      try {
        const core = getCore();
        if (directPath) {
          try { attempt = readAllocationAttemptSnapshot(core); validatedScalarWords += 16; attemptUnavailable = null; }
          catch (error) { attemptUnavailable = String(error).slice(0, 512); }
        }
        if (poolPath) {
          try {
            if (core?.withinRefstructAbortSnapshotAddress !== COMPOSITE_POOL_SLOT)
              throw new Error("Exact current compiled pool slot unavailable");
            const value = readLateRefstructAbortSnapshot(core);
            request = Object.freeze(value); validatedScalarWords += 16; requestUnavailable = null;
          } catch (error) { requestUnavailable = String(error).slice(0, 512); }
        }
        if (attempt || request) {
          try {
            const value = inspectDlmallocFreeHeaders(core.HEAPU8, { root: ALLOCATION_ATTEMPT_ROOT, expectedBytes: 33554432 });
            inventory = Object.freeze({ ...value, freeChunkSizeLog2Histogram: Object.freeze(value.freeChunkSizeLog2Histogram),
              bins: Object.freeze(value.bins.map(entry => Object.freeze(entry))) });
            inventoryUnavailable = null;
          } catch (error) { inventoryUnavailable = String(error).slice(0, 512); }
        }
      } catch (error) {
        if (directPath) attemptUnavailable = String(error).slice(0, 512);
        if (poolPath) requestUnavailable = String(error).slice(0, 512);
      }
    }
    first = Object.freeze({ ...row, scope: "one-current-direct-or-pool-request-and-bounded-free-headers-not-cause-or-acceptance",
      qualifiedBinarySha256, qualifiedDirectBufferCallPath: directPath, qualifiedPoolCallPath: poolPath,
      allocationAttempt: attempt, allocationAttemptUnavailable: attemptUnavailable,
      latePoolRequest: request, latePoolRequestUnavailable: requestUnavailable,
      allocatorFreeBlocks: inventory, allocatorFreeBlocksUnavailable: inventoryUnavailable,
      failedIndividualAllocationBytes: attempt?.failedIndividualAllocationBytes ?? request?.failedIndividualAllocationBytes ?? null,
      wrapperRequestedBytes: attempt?.wrapperRequestedBytes ?? null,
      heapLiveBytes: null, fragmentationCauseProven: false, originalFailureCauseProven: false,
      actualAllocatorRoot: ALLOCATION_ATTEMPT_ROOT, actualAttemptSlotAddress: ALLOCATION_ATTEMPT_SLOT,
      actualPoolSlotAddress: COMPOSITE_POOL_SLOT, validatedScalarWords, maximumScalarWords: 32,
      maximumAllocatorHeaderWords: 32768, maximumAllocatorFreeChunks: 4096,
      noNativeCallsAtAbort: true, noPayloadRead: true, noHeapCopy: true });
    try { emit(first); } catch (error) { emitFailure = String(error).slice(0, 512); }
  } });
  return Object.freeze({ onAbort: base.onAbort, withPriorOnAbort: base.withPriorOnAbort,
    report: () => ({ ...base.report(), first, emitFailure, qualifiedBinarySha256,
      actualAllocatorRoot: ALLOCATION_ATTEMPT_ROOT, actualAttemptSlotAddress: ALLOCATION_ATTEMPT_SLOT,
      actualPoolSlotAddress: COMPOSITE_POOL_SLOT, maximumScalarWords: 32 }) });
}
