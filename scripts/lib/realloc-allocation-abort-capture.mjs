// ONE actual fatal capture, retaining direct/pool/packet plus realloc paths.
import { createReallocAbortCapture } from "./realloc-composite-abort-capture.mjs";
import { REALLOC_DECODER_SHA256, REALLOC_ALLOCATOR_ROOT } from "./realloc-attempt-abort-capture.mjs";
import { readReallocAlignedAttemptSnapshot, REALLOC_ALIGNED_SLOT } from "./realloc-aligned-attempt-snapshot.mjs";
import { readLateRefstructAbortSnapshot } from "./late-refstruct-abort-snapshot.mjs";
import { inspectDlmallocFreeHeaders } from "./dlmalloc-free-header-inspection.mjs";
export const REALLOC_POOL_SLOT = 1918976;
export function createCompositeAllocationAbortCapture({ getCore, emit, qualifiedBinarySha256 }) {
  if (typeof getCore !== "function" || typeof emit !== "function" || qualifiedBinarySha256 !== REALLOC_DECODER_SHA256)
    throw new TypeError("Exact qualified realloc decoder and callbacks required");
  let first = null, emitFailure = null;
  const base = createReallocAbortCapture({ getCore, qualifiedBinarySha256, emit: row => {
    const available = !row.stackTruncated && !row.unavailable && typeof row.stack === "string";
    const has = index => available && row.stack.includes(`wasm-function[${index}]`);
    // Reuse the SAME bounded stack. Realloc branch already read its16 words;
    // never read other slots or headers again for that fatal.
    const directPath = !row.qualifiedReallocCallPath && [4189,4314,4473,4442].every(has);
    const poolPath = !row.qualifiedReallocCallPath && [4381,4314].every(has);
    const packetPath = !row.qualifiedReallocCallPath && [4471,4314,4473,4442].every(has);
    let attempt = null, request = null, inventory = row.allocatorFreeBlocks;
    let attemptUnavailable = "Qualified current alignment path unavailable; slot not read";
    let requestUnavailable = "Qualified current pool path unavailable; slot not read";
    let inventoryUnavailable = row.allocatorFreeBlocksUnavailable;
    let validatedScalarWords = row.validatedScalarWords;
    if (directPath || poolPath || packetPath) {
      try {
        const core = getCore();
        if (directPath || packetPath) {
          try { attempt = readReallocAlignedAttemptSnapshot(core); validatedScalarWords += 16; attemptUnavailable = null; }
          catch (error) { attemptUnavailable = String(error).slice(0,512); }
        }
        if (poolPath) {
          try {
            if (core?.withinRefstructAbortSnapshotAddress !== REALLOC_POOL_SLOT)
              throw new Error("Exact qualified current pool slot unavailable");
            request = Object.freeze(readLateRefstructAbortSnapshot(core)); validatedScalarWords += 16; requestUnavailable = null;
          } catch (error) { requestUnavailable = String(error).slice(0,512); }
        }
        if (attempt || request) {
          try {
            const value = inspectDlmallocFreeHeaders(core.HEAPU8, { root: REALLOC_ALLOCATOR_ROOT, expectedBytes: 33554432 });
            inventory = Object.freeze({ ...value, freeChunkSizeLog2Histogram: Object.freeze(value.freeChunkSizeLog2Histogram),
              bins: Object.freeze(value.bins.map(entry => Object.freeze(entry))) }); inventoryUnavailable = null;
          } catch (error) { inventoryUnavailable = String(error).slice(0,512); }
        }
      } catch (error) {
        if (directPath || packetPath) attemptUnavailable = String(error).slice(0,512);
        if (poolPath) requestUnavailable = String(error).slice(0,512);
      }
    }
    first = Object.freeze({ ...row, scope: "one-current-realloc-direct-pool-or-packet-request-not-cause-or-acceptance",
      qualifiedDirectBufferCallPath: directPath, qualifiedPoolCallPath: poolPath, qualifiedPacketCallPath: packetPath,
      allocationAttempt: attempt, allocationAttemptUnavailable: attemptUnavailable,
      latePoolRequest: request, latePoolRequestUnavailable: requestUnavailable,
      allocatorFreeBlocks: inventory, allocatorFreeBlocksUnavailable: inventoryUnavailable,
      failedIndividualAllocationBytes: attempt?.failedIndividualAllocationBytes ?? request?.failedIndividualAllocationBytes ?? null,
      wrapperRequestedBytes: attempt?.wrapperRequestedBytes ?? null,
      actualAttemptSlotAddress: REALLOC_ALIGNED_SLOT, actualPoolSlotAddress: REALLOC_POOL_SLOT,
      validatedScalarWords, maximumScalarWords: 32 });
    try { emit(first); } catch (error) { emitFailure = String(error).slice(0,512); }
  } });
  return Object.freeze({ onAbort: base.onAbort, withPriorOnAbort: base.withPriorOnAbort,
    report: () => ({ ...base.report(), first, emitFailure, maximumScalarWords: 32,
      actualAttemptSlotAddress: REALLOC_ALIGNED_SLOT, actualPoolSlotAddress: REALLOC_POOL_SLOT }) });
}
