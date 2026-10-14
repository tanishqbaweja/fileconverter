// Synthetic stack/heap + real export-section byte equality. NOT browser result.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { createReallocAbortCapture } from "../scripts/lib/realloc-composite-abort-capture.mjs";
import { readPendingReallocAttempt, REALLOC_DECODER_SHA256, REALLOC_SLOT, REALLOC_ALLOCATOR_ROOT } from "../scripts/lib/realloc-attempt-abort-capture.mjs";
import { makeReallocExportFactory } from "../scripts/lib/realloc-export-only-control.mjs";
import { makeReallocControlBrowserRecipe } from "../scripts/lib/realloc-control-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root,file),"utf8");
function fixture() {
  const heap=new Uint8Array(33554432),view=new DataView(heap.buffer),set=(at,value)=>view.setUint32(at,value,true);
  [0x52414c31,1,23,2,1,330918,0,0,0,0,0,0,0,330918,0,0].forEach((x,i)=>set(REALLOC_SLOT+i*4,x));
  set(REALLOC_ALLOCATOR_ROOT+12,1048568);set(REALLOC_ALLOCATOR_ROOT+16,2097152);set(REALLOC_ALLOCATOR_ROOT+24,3145728);set(3145732,1048569);
  for(const offset of [432,472,476])set(REALLOC_ALLOCATOR_ROOT+offset,2097152);
  return {core:{HEAPU8:heap,withinReallocAttemptAddress:REALLOC_SLOT,withinReallocAttemptWords:16},set};
}
function stack(indices,action){const original=globalThis.Error;class FakeError extends original{constructor(message){super(message);this.stack="SYNTHETIC UNIT ONLY "+indices.map(x=>`wasm-function[${x}]`).join(" ");}}
  globalThis.Error=FakeError;try{action(original);}finally{globalThis.Error=original;}}
const pathIndices=[4474,4192,4475,4440,4437,4442];
test("pending synthetic realloc capture preserves fatal/heap/prior callback, reads16 current words/header caps once, never invents malloc size",()=>stack(pathIndices,ErrorClass=>{
  const {core}=fixture(),before=sha(core.HEAPU8);let gets=0,emits=0,prior=0;
  const capture=createReallocAbortCapture({getCore:()=>{gets++;return core;},emit:()=>{emits++;},qualifiedBinarySha256:REALLOC_DECODER_SHA256});
  assert.equal(gets,0);const fatal=new ErrorClass("unchanged fatal");
  assert.throws(()=>capture.withPriorOnAbort(()=>{prior++;throw fatal;})("synthetic"),x=>x===fatal);capture.onAbort("duplicate");
  assert.equal(gets,1);assert.equal(emits,1);assert.equal(prior,1);assert.equal(sha(core.HEAPU8),before);
  const row=capture.report().first;assert.equal(row.qualifiedReallocCallPath,true);assert.equal(row.qualifiedBufferReallocCallPath,true);
  assert.equal(row.allocationApiRequestedBytes,330918);assert.equal(row.failedIndividualAllocationBytes,null);assert.equal(row.reallocAttempt.wordsRead,16);
  assert.equal(row.allocatorFreeBlocks.headerWordsRead,44);assert.equal(row.originalFailureCauseProven,false);assert.equal(row.noNativeCallsAtAbort,true);
}));
test("stale/high-word/incorrect binding/outer-owner inconsistency requests refuse attribution and no free-heap read",()=>stack(pathIndices,()=>{
  for(const [offset,value] of [[3,4],[6,1],[14,1],[15,1],[7,1234]]){
    const {core,set}=fixture();set(REALLOC_SLOT+offset*4,value);
    assert.throws(()=>readPendingReallocAttempt(core));
    const capture=createReallocAbortCapture({getCore:()=>core,emit:()=>{},qualifiedBinarySha256:REALLOC_DECODER_SHA256});capture.onAbort("synthetic");
    assert.equal(capture.report().first.reallocAttempt,null);assert.equal(capture.report().first.allocatorFreeBlocks,null);
  }
  assert.throws(()=>readPendingReallocAttempt({...fixture().core,withinReallocAttemptAddress:1918916}));
}));
test("unknown/partial typed call path never reads core; wrong binary rejected",()=>stack([4475,4442],()=>{
  let gets=0;const capture=createReallocAbortCapture({getCore:()=>{gets++;throw new Error("no read");},emit:()=>{},qualifiedBinarySha256:REALLOC_DECODER_SHA256});
  capture.onAbort("synthetic");assert.equal(gets,0);assert.equal(capture.report().first.reallocAttempt,null);
  assert.throws(()=>createReallocAbortCapture({getCore:()=>{},emit:()=>{},qualifiedBinarySha256:"0".repeat(64)}));
}));
test("actual export-only control changes only two typed exports; same audited headless/owned/private browser driver reverses exactly",async()=>{
  const runtime=await createOwnedRuntimeScratch("realloc-control-unit-");
  try{
    const original=await read("scripts/lib/refstruct-export-only-control.mjs"),factory=makeReallocExportFactory(original);
    let reverse=factory.generated;for(const [before,after] of factory.edits.toReversed())reverse=reverse.replace(after,before);assert.equal(reverse,original);
    const source=factory.generated.replace(/from "(\.\/[^"\r\n]+)"/g,(_,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts/lib",file)).href)}`);
    const file=path.join(runtime.directory,"factory.mjs");await writeFile(file,source,{flag:"wx"});
    const {createReallocExportOnlyControl}=await import(pathToFileURL(file).href),binary=await readFile(path.join(root,"work/mpeg2-realloc-attempt-38526781934/within-mpeg2-split.wasm"));
    const control=createReallocExportOnlyControl(binary);assert.equal(control.onlyExportSectionChanged,true);assert.equal(control.allCodeDataTypesImportsTablesMemoryExact,true);
    assert.deepEqual(control.additions.map(x=>x.functionIndex),[4474,4437]);assert.equal(control.usableForMediaOrAcceptance,false);
    const parent=await read("scripts/check-wasm-abort-capture-origin-checked.mjs");
    const recipe=makeReallocControlBrowserRecipe(parent,root,path.join(runtime.directory,"control.wasm"),control,"2026-10-14T00-00-00-000Z");
    reverse=recipe.generated;for(const [before,after] of recipe.edits.toReversed())reverse=reverse.replace(after,before);assert.equal(reverse,parent);
    const checked=spawnSync(process.execPath,["--check","--input-type=module"],{input:recipe.generated,encoding:"utf8",windowsHide:true,timeout:5000});assert.equal(checked.status,0,checked.stderr);
    for(const token of ["--headless=new","windowsHide: true","primaryIncrementalPrivateMiB: null","forbiddenRequests, []","owned-identity-absent","worker.terminate()","runtime.close()","runtimeSlotAddress,1918912"])
      assert.ok(recipe.generated.includes(token),token);
  }finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
});
