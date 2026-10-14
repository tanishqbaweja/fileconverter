// Offline captured-scalars only. Reuse EVERY pending-slot schema guard without
// inventing a heap/Module, reading payload, or relabelling realloc as malloc.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { REALLOC_DECODER_SHA256, REALLOC_SLOT, REALLOC_ALLOCATOR_ROOT } from "./realloc-attempt-abort-capture.mjs";
const root=path.resolve(import.meta.dirname,"../.."),read=name=>readFile(path.join(root,"scripts/lib",name),"utf8");
const observer=await read("realloc-attempt-abort-capture.mjs"),base=await read("composite-allocation-failure-record.mjs");
assert.equal(sha(base),"b017acf4e5abb6092e45b46eda7618800f38d04da3adbcb3c174baf8e23cfd16");
const start=observer.indexOf("export function readPendingReallocAttempt(core) {"),guards=observer.indexOf("  if (words[0]",start);
assert.ok(start>0&&guards>start);
const decodeSource='export function decodeCapturedPendingReallocWords(words) {\n'+
  '  if(!Array.isArray(words)||words.length!==16||!words.every(value=>Number.isInteger(value)&&value>=0&&value<=0xffffffff))throw new Error("Sixteen captured Wasm32 scalar words required");\n'+observer.slice(guards);
const {decodeCapturedPendingReallocWords}=await import("data:text/javascript;base64,"+Buffer.from(decodeSource).toString("base64"));
export function validatePendingReallocRecord(row) {
  if(row.role==="encoder")return;
  assert.equal(row.actualReallocSlotAddress,REALLOC_SLOT);
  assert.equal(typeof row.qualifiedReallocCallPath,"boolean");assert.equal(typeof row.qualifiedBufferReallocCallPath,"boolean");
  if(row.qualifiedReallocCallPath) {
    assert.equal(row.qualifiedDirectBufferCallPath,false);assert.equal(row.qualifiedPoolCallPath,false);assert.equal(row.qualifiedPacketCallPath,false);
    assert.equal(row.allocationAttempt,null);assert.equal(row.latePoolRequest,null);
  }
  if(row.reallocAttempt) {
    assert.equal(row.qualifiedReallocCallPath,true);assert.equal(row.reallocAttemptUnavailable,null);
    const expected=decodeCapturedPendingReallocWords(row.reallocAttempt.words);assert.deepEqual(row.reallocAttempt,expected);
    if(expected.outerBufferScope)assert.equal(row.qualifiedBufferReallocCallPath,true);
    assert.equal(row.allocationApiRequestedBytes,expected.allocationApiRequestedBytes);
    assert.equal(row.failedIndividualAllocationBytes,null);assert.equal(row.wrapperRequestedBytes,null);
  } else {assert.equal(typeof row.reallocAttemptUnavailable,"string");assert.equal(row.allocationApiRequestedBytes,null);}
}
const edits=[
  ['import { ALLOCATION_ATTEMPT_DECODER_SHA256 } from "./allocation-attempt-abort-capture.mjs";',
    `import { REALLOC_DECODER_SHA256 as ALLOCATION_ATTEMPT_DECODER_SHA256 } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/realloc-attempt-abort-capture.mjs")).href)};\n`+
    `import { validatePendingReallocRecord } from ${JSON.stringify(import.meta.url)};`],
  ['assert.equal(row.actualAllocatorRoot, 1786648); assert.equal(row.actualAttemptSlotAddress, 1918736); assert.equal(row.actualPoolSlotAddress, 1918800);',
    'assert.equal(row.actualAllocatorRoot, 1786760); assert.equal(row.actualAttemptSlotAddress, 1918848); assert.equal(row.actualPoolSlotAddress, 1918976);'],
  ['["qualifiedDirectBufferCallPath", "qualifiedPoolCallPath"]','["qualifiedDirectBufferCallPath", "qualifiedPoolCallPath", "qualifiedPacketCallPath", "qualifiedReallocCallPath", "qualifiedBufferReallocCallPath"]'],
  ['  let validatedWords = 0;', '  validatePendingReallocRecord(row);\n  let validatedWords = row.reallocAttempt ? 16 : 0;'],
  ['assert.equal(row.qualifiedDirectBufferCallPath, true);','assert.equal(row.qualifiedDirectBufferCallPath || row.qualifiedPacketCallPath, true);'],
  ['assert.ok(row.allocationAttempt || row.latePoolRequest);','assert.ok(row.allocationAttempt || row.latePoolRequest || row.reallocAttempt);'],
];
let generated=base;for(const [before,after] of edits){assert.equal(generated.split(before).length,2);generated=generated.replace(before,after);}
let reverse=generated;for(const [before,after] of edits.toReversed())reverse=reverse.replace(after,before);assert.equal(reverse,base);
// Avoid a self-import top-level-await cycle: replace only that injected import
// with the already declared function source in the data module.
const selfImport=`import { validatePendingReallocRecord } from ${JSON.stringify(import.meta.url)};`;
generated=generated.replace(selfImport,`const REALLOC_SLOT=${REALLOC_SLOT};\nconst decodeCapturedPendingReallocWords=(${decodeSource.replace("export function ","function ")});\n${validatePendingReallocRecord.toString()}`);
const factory=await import("data:text/javascript;base64,"+Buffer.from(generated).toString("base64"));
export const validateCompositeAllocationFailureRecord=factory.validateCompositeAllocationFailureRecord;
export const reallocFailureValidatorDerivation=Object.freeze({originalSha256:sha(base),capturedSchemaSha256:sha(observer),generatedSha256:sha(generated),edits,
  decoderSha256:REALLOC_DECODER_SHA256,allocatorRoot:REALLOC_ALLOCATOR_ROOT,noHeapOrModuleFabricated:true,internalMallocSizeInferred:false,publicAcceptance:false});
