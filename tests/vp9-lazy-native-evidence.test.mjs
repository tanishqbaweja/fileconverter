import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
const json=async f=>JSON.parse(await readFile(new URL("../evidence/"+f,import.meta.url))),
  native=await json("2026-11-06-vp9-original-width-native-42218018139.json"),
  controls=await json("2026-11-06-vp9-allocation-compiler-controls-42218018139.json");
test("actual lazy native build binds final translation units rather than intermediate preimages",async()=>{
  const terminal=await json("2026-11-06-vp9-original-width-build-42218018139-terminal.json");
  assert.equal(terminal.conclusion,"success");assert.equal(terminal.cleanupStepsPassed,true);assert.equal(native.head,"49ab50edfa03a65a4401afb53c5d9030bb497c88");
  assert.equal(native.head,terminal.head);const c=native.nativeContract.candidate;
  assert.equal(native.nativeContract.engine,"private-vp9-lazy-utility");assert.equal(Object.keys(native.nativeContract.artifacts).length,29);
  assert.equal(c.compiledVendorSources["vp9/encoder/vp9_encoder.c"],"e7d1012d3ababe3054fe90347c4a1a65f63715599a35a35867b1aebafd60a779");
  assert.equal(c.compiledVendorSources["vp9/encoder/vp9_picklpf.c"],"f5a66b83100c1d938a3f835a609b947db7d5349b7c5007b1eb77fa84d1f01ffa");
  assert.equal(c.ancestorPreimagesAreNotFinalTranslationUnits,true);assert.equal(c.lazyUtility.actualMemorySavedBytes,null);
  assert.equal(c.compiledWrapperSha256,"480532d89a4b4f696fced0faaa7be4f29cdbe7a71b990c69dfd2ddef6d346aa6");
  assert.deepEqual(c.wasmMemoryLimits,[{imported:true,initialPages:512,maximumPages:1536,shared:true}]);
  assert.equal(c.memoryLimitsRaised,false);assert.equal(native.nativeContract.modules[0].videoCodecThreads,1);assert.equal(native.nativeContract.modules[0].wasmPthreadPoolSize,0);
});
test("actual pinned lazy C controls and native bytes retain unproven browser/saved-memory status",()=>{
  assert.equal(native.nativeContract.artifacts["within-remux.wasm"].bytes,9877462);
  assert.equal(native.nativeContract.artifacts["within-remux.wasm"].sha256,"a39f54e28cdfc09cd63debe6ea38efff60cc53dfb346f8d2944231ca0c4dabd6");
  assert.equal(native.retainedBytes,11505551);assert.equal(controls.head,native.head);assert.equal(controls.artifactSha256,native.artifact.sha256);
  assert.deepEqual(controls.lazyUtilityCControls.variants.map(v=>v.allocationPairs),[40,80]);
  assert.deepEqual(controls.lazyUtilityCControls.variants.map(v=>v.scalingCases),[12,24]);
  assert.deepEqual(controls.lazyUtilityCControls.variants.map(v=>v.motionCases),[24,48]);
  assert.equal(controls.lazyUtilityCControls.actualMemorySavedBytes,null);
  for(const key of ["browserValidated","publicAcceptance","speedGainProven","nodeInstantiated"])assert.equal(native[key],false);
});
