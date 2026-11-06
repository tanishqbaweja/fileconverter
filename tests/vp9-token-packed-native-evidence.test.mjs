// Authenticate actual native artifacts only; never instantiate the codec.
import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {authenticateVp9PackedArtifacts} from "../media/ffmpeg/vp9-token-packed-artifacts.mjs";
const root=new URL("../",import.meta.url),read=file=>readFile(new URL(file,root)),json=async file=>JSON.parse(await read(file)),
  n=await json("evidence/2026-11-06-vp9-original-width-native-42244170876.json"),sha=s=>createHash("sha256").update(s).digest("hex");
test("actual source-built packed VP9 core retains fixed96MiB maximum, one thread/zero helpers and no native conversion",()=>{
  assert.equal(n.head,"0732ce78f0abb8b2a1b972ad16f1d3759fd9fd05");assert.equal(n.nativeContract.engine,"private-vp9-token-packed");
  assert.deepEqual(n.nativeContract.candidate.wasmMemoryLimits,[{imported:true,initialPages:512,maximumPages:1536,shared:true}]);
  assert.equal(n.nativeContract.modules[0].videoCodecThreads,1);assert.equal(n.nativeContract.modules[0].wasmPthreadPoolSize,0);
  assert.equal(n.nativeContract.candidate.tokenContext.ancestorOnly,true);assert.equal(n.nativeContract.candidate.tokenContext.layout,null);
  const p=n.nativeContract.candidate.tokenPacked;assert.equal(p.layout.highBitDepth,0);assert.equal(p.layout.packedRecordBytes,4);
  assert.equal(p.layout.previousRecordBytes,6);assert.equal(p.layout.actualLibraryConfiguration,true);assert.equal(p.actualMemorySavedBytes,null);
  assert.equal(n.nodeInstantiated,false);assert.equal(n.mediaRead,false);assert.equal(n.publicAssetReplacement,false);assert.equal(n.publicAcceptance,false);
  assert.equal(n.nativeContract.buildEnvironment.usedDocker,false);
});
test("all retained real native/source bytes and final packed provenance authenticate instead of trusting build labels",async()=>{
  for(const [file,pin]of Object.entries(n.nativeContract.artifacts)){const bytes=await read(n.retainedDirectory+"/"+file);assert.equal(bytes.length,pin.bytes);assert.equal(sha(bytes),pin.sha256,file);}
  const stems={"vp9/encoder/vp9_tokenize.h":"vp9_tokenize.header","vp9/encoder/vp9_tokenize.c":"vp9_tokenize.producer","vp9/encoder/vp9_bitstream.c":"vp9_bitstream.packer"},preimages={};
  for(const [file,stem]of Object.entries(stems))preimages[file]=(await read(n.retainedDirectory+"/"+stem+".base.c")).toString();
  const actual=await authenticateVp9PackedArtifacts(file=>read(n.retainedDirectory+"/"+file),preimages);
  assert.deepEqual(actual,n.nativeContract.candidate.tokenPacked);
  for(const [file,digest]of Object.entries(actual.sourceSha256s))assert.equal(n.nativeContract.candidate.compiledVendorSources[file],digest);
  assert.equal(n.nativeContract.artifacts["within-remux.wasm"].sha256,"436db67db8c5c21aa862c4fb71de6fc1e2bc1344ee31c8beb084b102065118c5");
});
test("failed precompile12 and successful13 retain exact distinct causes, actual CI skips and both cleanup steps",async()=>{
  const first=await json("evidence/2026-11-06-vp9-original-width-build-42243450950-terminal.json"),
    second=await json("evidence/2026-11-06-vp9-original-width-build-42244170876-terminal.json"),
    log=await json("evidence/2026-11-06-vp9-token-packed-build13-log-summary.json");
  assert.equal(first.conclusion,"failure");assert.equal(second.conclusion,"success");assert.equal(first.cleanupStepsPassed,true);assert.equal(second.cleanupStepsPassed,true);
  assert.equal(log.ciTests,51);assert.equal(log.ciPass,49);assert.equal(log.ciFail,0);assert.equal(log.ciSkipped,2);
  assert.equal(log.collectionFirstAttempt.status,"failed-before-owned-target-or-receipt-creation");
  assert.equal(second.artifact.digest,"sha256:"+n.artifact.sha256);assert.equal(n.artifact.bytes,3661933);assert.equal(n.retainedBytes,11809203);
});
