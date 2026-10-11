// Offline/runner boundary only: validate captured scalars, never inspect heap.
import assert from "node:assert/strict";
import { ALLOCATION_ATTEMPT_DECODER_SHA256 } from "./allocation-attempt-abort-capture.mjs";
export function validateCompositeAllocationFailureRecord(row) {
  assert.ok(["decoder", "encoder"].includes(row.role)); assert.equal(row.heapLiveBytes, null);
  assert.ok(typeof row.reason === "string" && row.reason.length <= 512);
  assert.ok(typeof row.stack === "string" && row.stack.length <= 8192);
  assert.equal(row.publicAcceptance, false);
  if (row.role === "encoder") { assert.equal(row.failedIndividualAllocationBytes, null); return row; }
  assert.equal(row.qualifiedBinarySha256, ALLOCATION_ATTEMPT_DECODER_SHA256);
  assert.equal(row.actualAllocatorRoot, 1786648); assert.equal(row.actualAttemptSlotAddress, 1918736); assert.equal(row.actualPoolSlotAddress, 1918800);
  assert.equal(row.maximumScalarWords, 32); assert.equal(row.maximumAllocatorHeaderWords, 32768); assert.equal(row.maximumAllocatorFreeChunks, 4096);
  assert.equal(row.originalFailureCauseProven, false); assert.equal(row.fragmentationCauseProven, false);
  for (const flag of ["noNativeCallsAtAbort", "noPayloadRead", "noHeapCopy"]) assert.equal(row[flag], true);
  for (const flag of ["qualifiedDirectBufferCallPath", "qualifiedPoolCallPath"]) assert.equal(typeof row[flag], "boolean");
  let validatedWords = 0;
  if (row.allocationAttempt) {
    const attempt = row.allocationAttempt; assert.equal(row.qualifiedDirectBufferCallPath, true); assert.equal(row.allocationAttemptUnavailable, null);
    assert.ok(Number.isInteger(attempt.wrapperRequestedBytes) && attempt.wrapperRequestedBytes > 0 && attempt.wrapperRequestedBytes <= 0xffffffff);
    assert.equal(attempt.alignment, 16); assert.equal(attempt.wordsRead, 16); assert.equal(attempt.slotBytes, 64); assert.equal(attempt.words.length, 16);
    assert.equal(attempt.completed, false); assert.equal(attempt.allocatorInternalChunkBytes, null);
    assert.ok(["fast-malloc-pending", "upstream-alignment-pending"].includes(attempt.phase));
    const words = attempt.words; assert.ok(words.every(word => Number.isInteger(word) && word >= 0 && word <= 0xffffffff));
    assert.equal(words[0], 1095519281); assert.equal(words[1], 1); assert.ok(words[2] > 0); assert.equal(words[2], attempt.sequence);
    assert.equal(words[3], attempt.phase === "fast-malloc-pending" ? 1 : 4); assert.equal(words[4], 16); assert.equal(words[5], attempt.wrapperRequestedBytes);
    assert.equal(words[6], 0); assert.equal(words[8], 0); assert.equal(words[9], words[7] & 15); assert.ok([0, 1].includes(words[10]));
    assert.ok(words.slice(11).every(word => word === 0)); assert.equal(attempt.freshUnexposedPointerFreed, words[10] === 1);
    if (words[3] === 1) { assert.ok(words[5] >= 262144); assert.ok(words.slice(7, 11).every(word => word === 0)); }
    else { assert.ok(words[7] < 33554432); assert.ok(words[7] === 0 ? words[10] === 0 : words[9] === 8 && words[10] === 1); }
    assert.equal(attempt.failedIndividualAllocationBytes, attempt.phase === "fast-malloc-pending" ? attempt.wrapperRequestedBytes : null);
    assert.equal(row.wrapperRequestedBytes, attempt.wrapperRequestedBytes); validatedWords += 16;
  } else { assert.equal(row.wrapperRequestedBytes, null); assert.equal(typeof row.allocationAttemptUnavailable, "string"); }
  if (row.latePoolRequest) {
    const request = row.latePoolRequest; assert.equal(row.qualifiedPoolCallPath, true); assert.equal(row.latePoolRequestUnavailable, null);
    assert.equal(request.failedIndividualAllocationBytes, request.payloadBytes + request.refcountHeaderBytes);
    assert.ok(Number.isInteger(request.failedIndividualAllocationBytes) && request.failedIndividualAllocationBytes > 0 && request.failedIndividualAllocationBytes <= 0xffffffff);
    assert.ok(request.refcountHeaderBytes >= 16 && request.refcountHeaderBytes <= 64 && request.refcountHeaderBytes % 16 === 0);
    assert.ok(Number.isInteger(request.observedPoolAddress) && request.observedPoolAddress > 0 && request.observedPoolAddress % 4 === 0 && request.observedPoolAddress + 64 <= 33554432);
    assert.equal(request.cachedEntriesInRequestedPoolBeforeRequest, 0); assert.equal(request.maximumScalarBytesRead, 64); validatedWords += 16;
  } else assert.equal(typeof row.latePoolRequestUnavailable, "string");
  assert.equal(row.validatedScalarWords, validatedWords);
  assert.equal(row.failedIndividualAllocationBytes, row.allocationAttempt?.failedIndividualAllocationBytes ?? row.latePoolRequest?.failedIndividualAllocationBytes ?? null);
  if (row.allocatorFreeBlocks) {
    assert.ok(row.allocationAttempt || row.latePoolRequest); assert.equal(row.allocatorFreeBlocksUnavailable, null);
    const inventory = row.allocatorFreeBlocks; assert.equal(inventory.complete, true);
    assert.ok(inventory.headerWordsRead > 0 && inventory.headerWordsRead <= 32768); assert.ok(inventory.freeChunks >= 0 && inventory.freeChunks <= 4096);
    for (const flag of ["heapCopied", "payloadRead", "nativeFunctionsCalled", "allocatorMutated", "fragmentationCauseProven"]) assert.equal(inventory[flag], false);
  } else assert.equal(typeof row.allocatorFreeBlocksUnavailable, "string");
  return row;
}
