import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {makeVp9TokenContextSources} from "../media/ffmpeg/vp9-token-context-recipe.mjs";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),
  r=await json("evidence/2026-11-06-vp9-original-width-native-42226266102.json");
test("authenticated changed native core proves actual low-bit record layout and unchanged whole heap/thread limits, not conversion acceptance",()=>{
  assert.equal(r.runId,42226266102);assert.equal(r.head,"50f7a3fa31816477a3fa85a37bc435d47a6afc9f");
  assert.equal(r.nativeContract.engine,"private-vp9-token-context");assert.equal(Object.keys(r.nativeContract.artifacts).length,39);
  assert.equal(r.retainedBytes,11696417);assert.equal(r.artifact.bytes,3636557);
  assert.equal(r.artifact.sha256,"57f60e667ef87da6eb9e3b0f1eee85643fc7199afa7d9bb282f3b7df57950df4");
  assert.equal(r.nativeContract.artifacts["within-remux.wasm"].sha256,"cf5e6e78fbc59c7b68569d54fcbcc2b3fb2211a673b32ce0b75ad09f4708a148");
  const c=r.nativeContract.candidate,t=c.tokenContext;
  assert.deepEqual(c.wasmMemoryLimits,[{imported:true,initialPages:512,maximumPages:1536,shared:true}]);
  assert.equal(r.nativeContract.modules[0].videoCodecThreads,1);assert.equal(r.nativeContract.modules[0].wasmPthreadPoolSize,0);
  assert.equal(t.layout.actualLibraryConfiguration,true);assert.equal(t.layout.highBitDepth,0);
  assert.equal(t.layout.originalRecordBytes,8);assert.equal(t.layout.compactRecordBytes,6);
  assert.equal(t.tokenCapacityChanged,false);assert.equal(t.actualMemorySavedBytes,null);assert.equal(t.browserValidated,false);
  assert.equal(r.originalRead,false);assert.equal(r.mediaRead,false);assert.equal(r.nodeInstantiated,false);assert.equal(r.publicAssetReplacement,false);
  assert.equal(r.browserValidated,false);assert.equal(r.speedGainProven,false);assert.equal(r.publicAcceptance,false);
});
test("actual final token sources and config/probe controls authenticate all source edits and preserve ancestor allocation diagnostics",async()=>{
  const audit=await json("evidence/2026-11-06-vp9-token-context-source-audit.json"),
    derived=makeVp9TokenContextSources(Object.fromEntries(Object.entries(audit.preimages).map(([f,v])=>[f,v.exactSource])));
  for(const [file,v]of Object.entries(derived.sources))assert.equal(r.nativeContract.candidate.compiledVendorSources[file],v.generatedSha256);
  assert.equal(createHash("sha256").update(await read("media/ffmpeg/vp9-token-context-recipe.mjs")).digest("hex"),
    r.nativeContract.sources["media/ffmpeg/vp9-token-context-recipe.mjs"]);
  const controls=await json("evidence/2026-11-06-vp9-allocation-compiler-controls-42226266102.json");
  assert.deepEqual(controls.tokenContextCControls.variants.map(v=>v.producerPackerCases),[69120,207360]);
  assert.equal(controls.tokenContextActualLayout.vpxConfigSha256,"fb78ef744859140ea2d5849d844d78e4a205053c8045f0701485e740edae2a2d");
  assert.equal(controls.tokenContextActualLayout.codecInstantiated,false);assert.equal(controls.tokenContextLifetime.sameLiveTableUsedByProducerAndPacker,true);
  assert.equal(controls.linkControls.cases[0].code,1);assert.equal(controls.linkControls.cases[1].code,0);
  assert.equal(controls.actualBrowserHeapMeasurements,null);assert.equal(controls.publicAcceptance,false);
});
