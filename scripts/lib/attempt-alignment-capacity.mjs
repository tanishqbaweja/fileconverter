// Exact current binary/C-slot join, not a generic allocator or a runtime probe.
import assert from "node:assert/strict";
export function deriveAttemptAlignmentCapacity({ wrapperText, allocatorText, fatalInstruction, failure }) {
  assert.equal(fatalInstruction, "call 4436 <emscripten_builtin_malloc>");
  assert.equal(failure.phase, "upstream-alignment-pending"); assert.equal(failure.freshUnexposedPointerFreed, true);
  assert.ok(Number.isSafeInteger(failure.wrapperRequestedBytes) && failure.wrapperRequestedBytes >= 262144 && failure.wrapperRequestedBytes < 0x7ffff000);
  assert.equal(failure.freshUnexposedPointer % 16, 8); assert.equal(failure.failedIndividualAllocationBytes, null);
  assert.equal([...wrapperText.matchAll(/call \$emscripten_builtin_malloc/g)].length, 2);
  assert.match(wrapperText, /local\.get \$p1\s+call \$emscripten_builtin_malloc/);
  assert.match(wrapperText, /i32\.const 1918748\s+i32\.const 4\s+i32\.store/);
  assert.match(wrapperText, /local\.get \$p1\s+i32\.const 11\s+i32\.add\s+i32\.const -8\s+i32\.and\s+local\.tee \$l2\s+local\.get \$p1\s+i32\.const 11\s+i32\.lt_u\s+select\s+local\.tee \$l6\s+i32\.const 28\s+i32\.add\s+local\.set \$p1/);
  assert.match(allocatorText, /local\.get \$p0\s+i32\.const 11\s+i32\.add[\s\S]{0,180}?i32\.const -8\s+i32\.and/);
  const free = failure.allocatorFreeBlocks; assert.equal(free.complete, true); assert.equal(free.allocatorMutated, false); assert.equal(free.payloadRead, false);
  const normalize = value => Math.floor((value + 11) / 8) * 8;
  const ordinaryChunkBytes = normalize(failure.wrapperRequestedBytes), derivedInternalMallocArgumentBytes = ordinaryChunkBytes + 28;
  const derivedInternalChunkBytes = normalize(derivedInternalMallocArgumentBytes), shortfall = derivedInternalChunkBytes - free.largestFreeChunkBytes;
  assert.ok(shortfall > 0); assert.ok(free.totalFreeChunkBytes > derivedInternalChunkBytes);
  const contiguousTailUpperBoundBytes = free.topChunkBytes + free.unclaimedMemoryAboveSegmentBytes; assert.ok(contiguousTailUpperBoundBytes < derivedInternalChunkBytes);
  return { wrapperRequestedBytes: failure.wrapperRequestedBytes, ordinaryChunkBytes, derivedInternalMallocArgumentBytes, derivedInternalChunkBytes,
    largestCapturedFreeChunkBytes: free.largestFreeChunkBytes, capturedChunkShortfallBytes: shortfall, capturedTotalFreeChunkBytes: free.totalFreeChunkBytes,
    contiguousTailUpperBoundBytes, firstFreshPointerAndItsRejectionActuallyObserved: true, originalSlotInternalRequestStillNull: true,
    internalRequestDerivation: "Actual current C-slot request + exact original fatal call and byte-qualified compiled argument/normalization flow, NOT heap growth extent",
    fragmentedFreeCapacityForThisFallbackProven: true, whyHeapFragmentedProven: false, retainedLiveInventoryKnown: false,
    newAlignmentPolicyWorksProven: false, fullOriginalAcceptance: false, publicAcceptance: false, speedGainProven: false };
}
