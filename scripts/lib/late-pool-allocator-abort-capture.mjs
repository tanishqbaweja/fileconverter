// Failure-only headers; no native calls, payload reads, heap copies or polling.
import { createLatePoolAbortCapture } from "./late-pool-abort-capture.mjs";
import { inspectDlmallocFreeHeaders } from "./dlmalloc-free-header-inspection.mjs";
export function createLatePoolAllocatorAbortCapture({ getCore, emit, poolGetterFunctionIndex,
  avMallocFunctionIndex, actualAllocatorRoot }) {
  if (actualAllocatorRoot !== 1786520 || typeof emit !== "function")
    throw new TypeError("Explicit compiled3e744 allocator root and emitter required");
  let first = null, emitFailure = null;
  const base = createLatePoolAbortCapture({ getCore, poolGetterFunctionIndex, avMallocFunctionIndex,
    emit: row => {
      let inventory = null, unavailable = null;
      try {
        if (!row.latePoolRequest || row.latePoolRequestUnavailable)
          throw new Error("Qualified pending pool request unavailable; allocator not read");
        inventory = inspectDlmallocFreeHeaders(getCore().HEAPU8,
          { root: actualAllocatorRoot, expectedBytes: 33554432 });
        inventory = Object.freeze({ ...inventory,
          freeChunkSizeLog2Histogram: Object.freeze(inventory.freeChunkSizeLog2Histogram),
          bins: Object.freeze(inventory.bins.map(entry => Object.freeze(entry))) });
      } catch (error) { unavailable = String(error).slice(0, 512); }
      first = Object.freeze({ ...row,
        scope: "one-pending-pool-request-and-bounded-free-headers-not-original-cause-or-acceptance",
        allocatorFreeBlocks: inventory, allocatorFreeBlocksUnavailable: unavailable,
        actualAllocatorRoot, maximumAllocatorHeaderWords: 32768, maximumAllocatorFreeChunks: 4096,
        heapLiveBytes: null, fragmentationCauseProven: false });
      try { emit(first); } catch (error) { emitFailure = String(error).slice(0, 512); }
    } });
  return Object.freeze({ onAbort: base.onAbort, withPriorOnAbort: base.withPriorOnAbort,
    report: () => ({ ...base.report(), first, emitFailure, maximumAllocatorHeaderWords: 32768,
      maximumAllocatorFreeChunks: 4096, actualAllocatorRoot }) });
}
