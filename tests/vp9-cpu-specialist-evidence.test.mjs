// Offline evidence checks only: no browser launch, fixture or conversion replay.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { unzipSync } from "fflate";
import { stableWindow } from "../scripts/lib/chromium-private-memory.mjs";
import { makeVp9CpuSpecialistQualificationSource } from "../scripts/lib/vp9-cpu-specialist-qualification-recipe.mjs";
import path from "node:path";
const root=path.resolve(import.meta.dirname,".."),runId="44735542199",prefix="evidence/2026-11-20-vp9-cpu-specialist-qualification-"+runId,
  read=f=>readFile(path.join(root,f)),json=async f=>JSON.parse(await read(f)),sha=b=>createHash("sha256").update(b).digest("hex"),
  r=await json(prefix+".json"),native=await json("evidence/2026-11-20-vp9-cpu-specialist-native-"+runId+".json"),
  golden="82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b";
function checkMemory(report){
  assert.deepEqual(stableWindow(report.blankSamples),report.blankBaseline);
  const active=report.nativeMemory.phases.filter(p=>p.phase==="conversion"||/^vp9-recovery-[0-4]$/.test(p.phase));
  assert.equal(active.length,6);
  const peak=active.map(p=>p.peak).reduce((a,b)=>a[3]>b[3]?a:b);
  assert.equal(report.memory.peak.privateBytes,peak[3]);assert.equal(report.memory.peak.sequence,peak[0]);
  assert.equal(report.memory.incrementalPrivateMiB,(peak[3]-report.blankBaseline.privateBytes)/1048576);
  assert.ok(report.memory.incrementalPrivateMiB<=250);
  assert.equal(report.memory.validSamples,active.reduce((n,p)=>n+p.validSamples,0));
  assert.equal(report.memory.unavailableSamples,active.reduce((n,p)=>n+p.unavailableSamples,0));
  assert.equal(report.memory.unavailableSamples,0);
  for(const p of active){
    assert.equal(p.peak[3],p.peak[7].reduce((n,row)=>n+row[1],0));
    assert.equal(p.peak[4],p.peak[7].reduce((n,row)=>n+row[2],0));
    assert.ok(p.validSamples>0);
  }
}
test("actual specialist receipt rederives earliest stable blank, all-process phase peaks and all75 valid active samples",()=>{
  assert.equal(r.executedHead,"154864fb0b412e3ba663278bf8bad07e0bf3cd08");
  assert.equal(r.status,"passed-private-vp9-recovery-sequence-not-large-or-public-acceptance");assert.deepEqual(r.failures,[]);
  checkMemory(r);assert.equal(r.memory.incrementalPrivateMiB,186.7734375);assert.equal(r.memory.validSamples,75);
  assert.equal(r.nativeMemory.sequence,473);assert.equal(r.nativeMemory.identities.length,42);
  // Full100ms journal is NOT retained: phase peaks/counts and bounded graph are.
  assert.equal(r.nativeMemory.graphBucketDurationMs,1000);assert.equal(r.nativeMemory.graphBucketsEvicted,0);
});
test("wrong primary baseline/total/process sum or unavailable count cannot make the retained memory gate pass",()=>{
  for(const mutate of [c=>c.memory.peak.privateBytes++,c=>c.blankBaseline.privateBytes++,
    c=>c.nativeMemory.phases.find(p=>p.phase==="conversion").peak[7][0][1]++,
    c=>c.memory.validSamples++,c=>c.memory.unavailableSamples=1]){
    const c=structuredClone(r);mutate(c);assert.throws(()=>checkMemory(c));
  }
});
test("four actual outputs match the unmodified golden; every48-frame clock/metadata/SSIM oracle and both real faults passed",()=>{
  assert.equal(r.fixture.sha256,"4fad7ea6c1dd0d374b1b69201b6af4b68e8518bf2672884d23b1f136f5f2cc46");
  const outputs=[{outputSha256:r.outputSha256,validation:r.independentFidelity},...r.recovery.cases.filter(c=>c.validation)];assert.equal(outputs.length,4);
  for(const c of outputs){assert.equal(c.outputSha256,golden);assert.equal(c.validation.passed,true);
    assert.equal(c.validation.clocks.frames,48);assert.equal(c.validation.clocks.maximumVideoPtsErrorSeconds,0);
    assert.equal(c.validation.outputFrames.framesWithDuration,48);assert.equal(c.validation.containerDuration.errorSeconds,0);
    assert.equal(c.validation.ssim.score,0.993273);assert.equal(c.validation.metadata.length,8);assert.ok(c.validation.metadata.every(m=>m.equal));}
  assert.equal(r.storedTiming.output.blocks.length,48);assert.equal(r.storedTiming.explicitDefaultDurationGatePassed,true);
  assert.equal(r.recovery.cases.length,5);assert.equal(r.recovery.passed,true);assert.equal(r.recovery.maximumCleanupDeltaMiB,96);
  for(const c of r.recovery.cases){assert.equal(c.passed,true);assert.equal(c.opfsRemoved,true);assert.equal(c.outputRemoved,true);
    assert.equal(c.cleanupDeltaFromLoadedMiB,(c.afterCleanup.privateBytes-r.loadedIdle.privateBytes)/1048576);
    assert.ok(c.cleanupDeltaFromLoadedMiB<=96);if(c.requestedFault){assert.equal(c.browserOutputBytes,0);assert.equal(c.result.qualificationFaultTriggered,true);}}
});
test("new native core was delivered by real static HTTP and automatic fallback still attempted both children with bounded queues",()=>{
  const h=r.privateCpuOverride;assert.equal(h.runId,Number(runId));assert.equal(h.sourceHead,native.head);
  assert.deepEqual(h.served,{javascript:6,wasm:6});assert.deepEqual(h.errors,[]);assert.equal(h.devtoolsResponseBodyUsed,false);
  for(const name of ["within-remux.mjs","within-remux.wasm"])assert.deepEqual(h.files[name],native.nativeContract.artifacts[name]);
  for(const result of [r.browserResult,...r.recovery.cases.map(c=>c.result)]){
    assert.equal(result.isolation.childrenStarted,2);assert.equal(result.isolation.candidateTerminationRequestedBeforeFallback,true);
    assert.equal(result.isolation.terminationRequests,2);assert.equal(result.cleanupComplete,true);
    assert.ok(result.metrics.peakPendingOperations<=1);assert.ok(result.metrics.peakQueuedBytes<=1048576);
    assert.ok(result.metrics.maxReadChunkBytes<=262144);assert.ok(result.metrics.maxWriteChunkBytes<=1048576);
  }
  assert.equal(r.normalHttpEngineDelivery,true);assert.deepEqual(r.forbiddenRequests,[]);
});
test("all observed browser IDs and all three roots absent; owned data removed and protected original unchanged without public or speed claim",()=>{
  assert.equal(r.browserCleanup.status,"owned-observed-pids-absent");
  assert.deepEqual([...r.browserCleanup.observedPids].sort((a,b)=>a-b),[...new Set(r.nativeMemory.identities.map(p=>p.pid))].sort((a,b)=>a-b));
  assert.ok(r.processCleanup.every(c=>c.status==="owned-identity-absent"));assert.equal(r.processCleanup.length,3);
  assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);assert.equal(r.privateCpuOverride.stageRemoved,true);
  assert.deepEqual(r.originalBefore,{bytes:2958573265,sha256:"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34"});
  assert.deepEqual(r.originalAfter,r.originalBefore);assert.equal(r.browserPinFinalCheck,"verified");
  for(const k of ["publicAcceptance","fullStressAcceptance","speedGainProven","browserServicesDisabled","headed"])assert.equal(r[k],false);
});
test("actual generated control authenticates pinned parent and native receipt; every retained source still has its recorded hash",async()=>{
  const recipe=await json(prefix+"-recipe.json"),parent=await json(recipe.parentRecipe),source=gunzipSync(Buffer.from(parent.generatedSourceGzipBase64,"base64")).toString();
  assert.equal(sha(await read(recipe.parentRecipe)),recipe.parentRecipeSha256);assert.equal(sha(await read(recipe.nativeReceipt)),recipe.nativeReceiptSha256);
  const derived=makeVp9CpuSpecialistQualificationSource(source,root,runId);
  assert.equal(recipe.generatedSha256,derived.generatedSha256);
  assert.equal(gunzipSync(Buffer.from(recipe.generatedSourceGzipBase64,"base64")).toString(),derived.generated);
  for(const [file,digest]of Object.entries(r.sourcePins)){
    const hash=createHash("sha256");for await(const bytes of createReadStream(path.join(root,file),{highWaterMark:262144}))hash.update(bytes);
    assert.equal(hash.digest("hex"),digest,file);
  }
});
test("actual bounded trace authenticates screenshots/API with no DOM snapshots or Wasm response copies",async()=>{
  const bytes=await read(r.boundedDiagnosticTrace.path);assert.equal(bytes.length,r.boundedDiagnosticTrace.bytes);assert.equal(sha(bytes),r.boundedDiagnosticTrace.sha256);
  let total=0,count=0;const members=unzipSync(bytes,{filter(e){assert.ok(++count<=256);total+=e.originalSize;assert.ok(total<=16777216&&e.originalSize<=4194304);return true;}});
  let screenshots=0,before=0,after=0;
  for(const [name,data]of Object.entries(members)){
    assert.notEqual(Buffer.from(data.subarray(0,4)).toString("hex"),"0061736d");assert.equal(name.endsWith(".wasm"),false);
    if(name.startsWith("resources/")){assert.ok(name.endsWith(".jpeg"));screenshots++;}
    if(name.endsWith(".trace"))for(const line of Buffer.from(data).toString().split("\n"))if(line){const e=JSON.parse(line);
      assert.notEqual(e.type,"frame-snapshot");if(e.type==="before")before++;if(e.type==="after")after++;}
    if(name.endsWith(".network"))assert.equal(Buffer.from(data).toString().trim(),"");
  }
  assert.ok(screenshots>0&&before>0);assert.equal(before,after);
});
