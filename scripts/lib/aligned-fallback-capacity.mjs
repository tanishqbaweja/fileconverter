// Specific compiled dlmalloc/16-byte alignment path, not a general allocator.
import assert from "node:assert/strict";
export function alignedFallbackCapacityFacts({ wrapperText, allocatorText, fatalCallOffset, request, freeHeaders }) {
  assert.equal(fatalCallOffset, "0x606cc7");
  assert.equal([...wrapperText.matchAll(/call \$emscripten_builtin_malloc/g)].length, 2);
  // First ordinary malloc uses original bytes; rejected pointer is freed before
  // the second call. The compiled generic aligned fallback expands twice.
  assert.match(wrapperText, /local\.get \$p1\s+call \$emscripten_builtin_malloc/);
  assert.match(wrapperText, /local\.get \$l2\s+i32\.const 15\s+i32\.and\s+i32\.eqz/);
  assert.match(wrapperText, /local\.get \$l2\s+call \$emscripten_builtin_free/);
  assert.match(wrapperText, /local\.get \$p1\s+i32\.const 11\s+i32\.add\s+i32\.const -8\s+i32\.and[\s\S]*?local\.tee \$l7\s+i32\.const 28\s+i32\.add\s+local\.set \$p1/);
  assert.match(allocatorText, /local\.get \$p0\s+i32\.const 11\s+i32\.add\s+local\.tee \$l1\s+i32\.const -8\s+i32\.and\s+local\.set \$l6/);
  const bytes = request.failedIndividualAllocationBytes;
  assert.ok(Number.isSafeInteger(bytes) && bytes >= 262144 && bytes < 0x7ffff000);
  assert.equal(bytes, request.payloadBytes + request.refcountHeaderBytes);
  assert.equal(freeHeaders.complete, true);
  assert.ok(Number.isSafeInteger(freeHeaders.largestFreeChunkBytes) && freeHeaders.largestFreeChunkBytes > 0);
  // Avoid JS signed bitwise truncation; these compiled operations round to8.
  const normalize = value => Math.floor((value + 11) / 8) * 8;
  const ordinaryMallocChunkBytes = normalize(bytes);
  const fallbackMallocArgumentBytes = ordinaryMallocChunkBytes + 28;
  const fallbackMallocChunkBytes = normalize(fallbackMallocArgumentBytes);
  const shortfall = fallbackMallocChunkBytes - freeHeaders.largestFreeChunkBytes;
  assert.ok(shortfall > 0, "This evidence only proves capacity failure when every free chunk is too small");
  assert.ok(freeHeaders.totalFreeChunkBytes > fallbackMallocChunkBytes, "Fragmented capacity, not total free-byte shortage");
  const maximumTopPlusUnclaimedBytes = freeHeaders.topChunkBytes + freeHeaders.unclaimedMemoryAboveSegmentBytes;
  assert.ok(maximumTopPlusUnclaimedBytes < fallbackMallocChunkBytes, "Do not infer blocked growth when captured contiguous tail could fit");
  return { originalAvMallocBytes: bytes, ordinaryMallocChunkBytes, fallbackMallocArgumentBytes, fallbackMallocChunkBytes,
    largestActualFreeChunkBytes: freeHeaders.largestFreeChunkBytes, fallbackChunkShortfallBytes: shortfall,
    totalActualFreeChunkBytes: freeHeaders.totalFreeChunkBytes, maximumTopPlusUnclaimedBytes,
    ordinaryChunkCouldFitRecordedLargest: ordinaryMallocChunkBytes <= freeHeaders.largestFreeChunkBytes,
    noRecordedFreeChunkCanFitActualFallback: true, evenUnclaimedTailCannotMakeTopFitFallback: true,
    fragmentedFreeCapacityForActualFallbackProven: true,
    observedOrdinaryMallocPointer: null, ordinaryMallocPointerAlignmentObserved: false,
    whyAllocatorFragmentedProven: false, liveFrameInventoryMeasured: false, optimalFixProven: false,
    productionEngineChanged: false, runtimeFixImplemented: false, publicAcceptance: false };
}
