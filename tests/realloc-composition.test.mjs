// Synthetic heap/stack units are NOT actual browser/media acceptance.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { createCompositeAllocationAbortCapture, REALLOC_POOL_SLOT } from "../scripts/lib/realloc-allocation-abort-capture.mjs";
import { readReallocAlignedAttemptSnapshot, REALLOC_ALIGNED_SLOT } from "../scripts/lib/realloc-aligned-attempt-snapshot.mjs";
import { REALLOC_DECODER_SHA256, REALLOC_SLOT, REALLOC_ALLOCATOR_ROOT } from "../scripts/lib/realloc-attempt-abort-capture.mjs";
import { makeReallocAsyncifyGlue } from "../scripts/lib/realloc-asyncify-glue-recipe.mjs";
import { makeCompositeReallocControlBrowserRecipe, makeCompositeReallocControlCaller } from "../scripts/lib/realloc-composite-control-recipe.mjs";
const root = path.resolve(import.meta.dirname,".."), read = name => readFile(path.join(root,name),"utf8");
function fixture() {
  const heap = new Uint8Array(33554432), view = new DataView(heap.buffer), set = (at,value)=>view.setUint32(at,value,true);
  [0x52414c31,1,23,2,1,330918,0,0,0,0,0,0,0,330918,0,0].forEach((x,i)=>set(REALLOC_SLOT+i*4,x));
  [1095519281,1,7,1,16,300000,0,0,0,0,0,0,0,0,0,0].forEach((x,i)=>set(REALLOC_ALIGNED_SLOT+i*4,x));
  [0x52504631,1,13,1,2000000,100000,32,100032,7,0,0,0,4,1,0,0].forEach((x,i)=>set(REALLOC_POOL_SLOT+i*4,x));
  set(REALLOC_ALLOCATOR_ROOT+12,1048568);set(REALLOC_ALLOCATOR_ROOT+16,2097152);set(REALLOC_ALLOCATOR_ROOT+24,3145728);set(3145732,1048569);
  for(const offset of [432,472,476])set(REALLOC_ALLOCATOR_ROOT+offset,2097152);
  return {core:{HEAPU8:heap,withinReallocAttemptAddress:REALLOC_SLOT,withinReallocAttemptWords:16,
    withinAllocatorAttemptAddress:REALLOC_ALIGNED_SLOT,withinAllocatorAttemptWords:16,
    withinRefstructAbortSnapshotAddress:REALLOC_POOL_SLOT,withinRefstructAbortSnapshotWords:16},set};
}
function withStack(indices,action) {
  const Original = globalThis.Error; let captures = 0;
  class FakeError extends Original { constructor(message) { super(message);captures++;this.stack="SYNTHETIC UNIT ONLY "+indices.map(x=>`wasm-function[${x}]`).join(" "); } }
  globalThis.Error = FakeError; try { action(Original,()=>captures); } finally { globalThis.Error = Original; }
}
test("new ABI aligned reader preserves every old schema guard, changing only actual slot name/address",async()=>{
  const old = await read("scripts/lib/packet-largest-idle-attempt-abort-capture.mjs");
  const body = old.slice(old.indexOf("export function readAllocationAttemptSnapshot"),old.indexOf("export function createAllocationAttemptAbortCapture"));
  const fresh = await read("scripts/lib/realloc-aligned-attempt-snapshot.mjs");
  assert.equal(fresh.slice(fresh.indexOf("export function readReallocAlignedAttemptSnapshot")),body.replaceAll("readAllocationAttemptSnapshot","readReallocAlignedAttemptSnapshot").replaceAll("ALLOCATION_ATTEMPT_SLOT","REALLOC_ALIGNED_SLOT"));
  const {core,set}=fixture();assert.equal(readReallocAlignedAttemptSnapshot(core).wrapperRequestedBytes,300000);
  set(REALLOC_ALIGNED_SLOT+12,3);assert.throws(()=>readReallocAlignedAttemptSnapshot(core));
  assert.throws(()=>readReallocAlignedAttemptSnapshot({...core,withinAllocatorAttemptAddress:1918736}));
});
test("single realloc stack/header read retains actual API request and original fatal/prior callback without stale other-slot attribution",()=>withStack([4474,4192,4475,4440,4437,4442],(Original,count)=>{
  const {core}=fixture(),before=sha(core.HEAPU8);let gets=0,emits=0,prior=0;
  const capture=createCompositeAllocationAbortCapture({getCore:()=>{gets++;return core;},emit:()=>{emits++;},qualifiedBinarySha256:REALLOC_DECODER_SHA256});
  assert.equal(gets,0);const fatal=new Original("unchanged");
  assert.throws(()=>capture.withPriorOnAbort(()=>{prior++;throw fatal;})("synthetic"),x=>x===fatal);capture.onAbort("duplicate");
  const row=capture.report().first;assert.equal(count(),1);assert.equal(gets,1);assert.equal(emits,1);assert.equal(prior,1);
  assert.equal(row.validatedScalarWords,16);assert.equal(row.maximumScalarWords,32);assert.equal(row.allocationApiRequestedBytes,330918);
  assert.equal(row.allocationAttempt,null);assert.equal(row.latePoolRequest,null);assert.equal(row.allocatorFreeBlocks.headerWordsRead,44);
  assert.equal(row.failedIndividualAllocationBytes,null);assert.equal(sha(core.HEAPU8),before);assert.equal(capture.report().maximumRecords,1);
}));
test("updated typed direct/pool/packet paths and overlapping32-word cap; unknown/old/partial paths never read core",()=>{
  for(const [indices,expectedWords,request] of [[[4189,4314,4473,4442],16,300000],[[4381,4314],16,100032],[[4471,4314,4473,4442],16,300000],[[4381,4314,4471,4473,4442],32,300000]])
    withStack(indices,(_Original,count)=>{const {core}=fixture();let gets=0;const capture=createCompositeAllocationAbortCapture({getCore:()=>{gets++;return core;},emit:()=>{},qualifiedBinarySha256:REALLOC_DECODER_SHA256});
      capture.onAbort("synthetic");const row=capture.report().first;assert.equal(gets,1);assert.equal(count(),1);
      assert.equal(row.validatedScalarWords,expectedWords);assert.equal(row.failedIndividualAllocationBytes,request);assert.equal(row.allocatorFreeBlocks.headerWordsRead,44);});
  for(const indices of [[4188,4313,4473,4442],[4382,4314],[4471,4313,4473,4442],[4475,4442],[]])
    withStack(indices,()=>{let gets=0;const capture=createCompositeAllocationAbortCapture({getCore:()=>{gets++;},emit:()=>{},qualifiedBinarySha256:REALLOC_DECODER_SHA256});
      capture.onAbort("synthetic");assert.equal(gets,0);assert.equal(capture.report().first.validatedScalarWords,0);});
});
test("malformed slots refuse attribution, wrong binary rejected, emit failure bounded",()=>withStack([4474,4192,4475,4440,4437,4442],()=>{
  const {core,set}=fixture();set(REALLOC_SLOT+12,4);const capture=createCompositeAllocationAbortCapture({getCore:()=>core,emit:()=>{throw new Error("x".repeat(1000));},qualifiedBinarySha256:REALLOC_DECODER_SHA256});
  capture.onAbort("synthetic");assert.equal(capture.report().first.reallocAttempt,null);assert.equal(capture.report().first.allocatorFreeBlocks,null);
  assert.ok(capture.report().emitFailure.length<=512);assert.throws(()=>createCompositeAllocationAbortCapture({getCore:()=>core,emit:()=>{},qualifiedBinarySha256:"0".repeat(64)}));
}));
test("actual new glue uses the identical four reversible lifecycle edits and fixed262144B stack",async()=>{
  const original=await read("work/mpeg2-realloc-attempt-38526781934/within-mpeg2-split.mjs"),patch=await makeReallocAsyncifyGlue(root,original);
  let reverse=patch.generated;for(const [before,after] of patch.edits.toReversed())reverse=reverse.replace(after,before);
  assert.equal(reverse,original);assert.equal(patch.heapLimitsChanged,false);assert.equal(patch.nativeWasmChanged,false);
  assert.equal(patch.recipeOnlyOriginalGlueHashChanged,true);assert.equal(patch.generated.split("StackSize:262144").length,2);
});
test("fresh composite control preserves audited headless gates/128-source cap and separate namespace",async()=>{
  const control={originalSha256:REALLOC_DECODER_SHA256,onlyExportSectionChanged:true,allCodeDataTypesImportsTablesMemoryExact:true,usableForMediaOrAcceptance:false};
  const runtime=await createOwnedRuntimeScratch("realloc-composition-unit-");
  try {
    const recipe=makeCompositeReallocControlBrowserRecipe(await read("scripts/check-wasm-abort-capture-origin-checked.mjs"),root,path.join(runtime.directory,"control.wasm"),control,"2026-10-14T00-00-00-000Z");
    const caller=makeCompositeReallocControlCaller(await read("scripts/check-realloc-abort-control.mjs"),root);
    for(const source of [recipe.generated,caller.generated]){const file=path.join(runtime.directory,"syntax.mjs");await writeFile(file,source);
      const checked=spawnSync(process.execPath,["--check",file],{encoding:"utf8",windowsHide:true,timeout:5000});assert.equal(checked.status,0,checked.stderr);}
    for(const gate of ["--headless=new","windowsHide: true","owned-identity-absent","worker.terminate()","runtime.close()","forbiddenRequests, []","primaryIncrementalPrivateMiB: null","maximumScalarWords,32"])
      assert.ok(recipe.generated.includes(gate),gate);
    assert.ok(caller.generated.includes("files.length<=128"));assert.ok(caller.generated.includes("postSourcePins[file],hash"));
    assert.ok(caller.generated.includes("realloc-composite-control-executed-sources.json"));
  } finally { await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"}); }
});
