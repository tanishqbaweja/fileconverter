import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { validateCompositeAllocationFailureRecord,reallocFailureValidatorDerivation } from "../scripts/lib/realloc-full-failure-record.mjs";
const root=path.resolve(import.meta.dirname,"..");
const proof=JSON.parse(await readFile(path.join(root,"evidence/2026-10-14T08-50-39-535Z-realloc-composite-control.json")));
const actual=proof.result.terminal.emitted;
test("offline full boundary validates actual combined control's16 captured scalar words/headers without a fake heap or malloc attribution",()=>{
  assert.equal(validateCompositeAllocationFailureRecord(actual),actual);assert.equal(actual.allocationApiRequestedBytes,33554432);
  assert.equal(actual.failedIndividualAllocationBytes,null);assert.equal(reallocFailureValidatorDerivation.noHeapOrModuleFabricated,true);
});
test("offline boundary refuses forged actual API/heap-extent-as-request, stale phase/high words/binding/outer ownership/inventory and cap changes",()=>{
  for(const mutate of [row=>row.allocationApiRequestedBytes++,row=>row.failedIndividualAllocationBytes=35741696,row=>row.reallocAttempt.words[3]=4,
    row=>row.reallocAttempt.words[14]=1,row=>row.actualReallocSlotAddress++,row=>row.qualifiedBufferReallocCallPath=false,
    row=>row.validatedScalarWords=32,row=>row.maximumScalarWords=48,row=>row.allocatorFreeBlocks.payloadRead=true,
    row=>row.allocationAttempt={},row=>row.actualAllocatorRoot=1786648,row=>row.reallocAttempt.oldBufferSize=1]) {
    const changed=structuredClone(actual);mutate(changed);assert.throws(()=>validateCompositeAllocationFailureRecord(changed));
  }
});
test("qualified unknown/stale record remains un-attributed, refuses allocator inventory without a current request",()=>{
  const row=structuredClone(actual);row.reallocAttempt=null;row.reallocAttemptUnavailable="Current phase unavailable";row.allocationApiRequestedBytes=null;
  row.allocatorFreeBlocks=null;row.allocatorFreeBlocksUnavailable="No current request";row.validatedScalarWords=0;
  assert.equal(validateCompositeAllocationFailureRecord(row),row);
  row.allocatorFreeBlocks=structuredClone(actual.allocatorFreeBlocks);row.allocatorFreeBlocksUnavailable=null;assert.throws(()=>validateCompositeAllocationFailureRecord(row));
});
