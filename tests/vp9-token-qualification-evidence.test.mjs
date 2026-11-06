import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),
  base="evidence/2026-11-06-vp9-token-qualification-42226266102",r=await json(base+".json");
test("first token browser output is genuine bit-exact and independently valid while unavailable blank baseline keeps whole test failed",()=>{
  assert.equal(r.executedHead,"3e2779e8cab2a15d026f18cf21edd2ce9c0b19b4");
  assert.equal(r.status,"failed-private-vp9-browser-smoke");assert.equal(r.privateCpuOverride.runId,42226266102);
  assert.equal(r.outputSha256,"82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b");
  assert.equal(r.browserResult.metrics.outputBytes,99413);assert.equal(r.independentFidelity.passed,true);
  assert.equal(r.independentFidelity.ssim.score,0.993273);assert.equal(r.independentFidelity.clocks.frames,48);
  assert.equal(r.storedTiming.explicitDefaultDurationGatePassed,undefined);
  assert.equal(r.storedTiming.source.tracks[0].defaultDurationNs,41666666);
  assert.equal(r.storedTiming.output.tracks[0].defaultDurationNs,41666666);
  assert.equal(r.blankBaseline,null);assert.equal(r.baselineAvailable,false);assert.equal(r.memory.incrementalPrivateMiB,null);
  assert.equal(r.memory.validSamples,52);assert.equal(r.memory.unavailableSamples,0);assert.equal(r.recovery,undefined);
  assert.equal(r.failures.length,2);assert.equal(r.publicAcceptance,false);assert.equal(r.speedGainProven,false);
});
test("failed baseline run cleans owned disposable data and roots, original unchanged and raw diagnostics preserved exactly",async()=>{
  assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);assert.equal(r.browserResult.cleanupComplete,true);
  assert.equal(r.processCleanup.length,3);assert.ok(r.processCleanup.every(p=>p.status==="owned-identity-absent"));
  assert.deepEqual(r.originalBefore,r.originalAfter);assert.equal(r.originalAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.deepEqual(r.forbiddenRequests,[]);
  const raw=gunzipSync(await read(r.rawArchive.file),{maxOutputLength:8388608});assert.equal(raw.length,328183);
  assert.equal(createHash("sha256").update(raw).digest("hex"),r.rawArchive.decodedSha256);
  const archive=await json("evidence/2026-11-06-vp9-token-qualification-control-42226266102-archive.json");assert.equal(archive.retainedBytes,122786);
});
test("separate fail-fast retry completes all strict bit-exact/fidelity/recovery gates under same whole-Chrome formula",async()=>{
  const b=await json(base+"-attempt2.json");
  assert.equal(b.executedHead,"91c10b97d9a007a9ddd9ea0b2ab69d0253603744");
  assert.equal(b.status,"passed-private-vp9-recovery-sequence-not-large-or-public-acceptance");assert.deepEqual(b.failures,[]);
  assert.equal(b.temporalAllocationGuard.tokenContextStorage,true);assert.equal(b.recovery.passed,true);
  const outputs=[{outputSha256:b.outputSha256,validation:b.independentFidelity},...b.recovery.cases.filter(c=>c.validation)];assert.equal(outputs.length,4);
  for(const c of outputs) {
    assert.equal(c.outputSha256,"82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b");
    assert.equal(c.validation.passed,true);assert.equal(c.validation.clocks.frames,48);assert.equal(c.validation.clocks.maximumVideoPtsErrorSeconds,0);
    assert.equal(c.validation.outputFrames.framesWithDuration,48);assert.equal(c.validation.containerDuration.errorSeconds,0);
    assert.equal(c.validation.ssim.score,0.993273);assert.ok(c.validation.metadata.length===8&&c.validation.metadata.every(m=>m.equal));
  }
  assert.equal(b.storedTiming.explicitDefaultDurationGatePassed,true);
  assert.equal(b.blankBaseline.privateBytes,358494208);assert.equal(b.memory.peak.privateBytes,604147712);
  assert.equal(b.memory.incrementalPrivateMiB,234.2734375);assert.equal(b.memory.validSamples,238);assert.equal(b.memory.unavailableSamples,0);
  assert.equal(b.memory.incrementalPrivateMiB,(b.memory.peak.privateBytes-b.blankBaseline.privateBytes)/1048576);
  const recipe=await json(base+"-attempt2-recipe.json");assert.equal(recipe.baselinePreflight,true);
  assert.equal(recipe.baselineRetry.priorSha256,createHash("sha256").update(await read(base+".json")).digest("hex"));
  assert.equal(recipe.baselineRetry.maximumAdditionalSessions,1);assert.equal(recipe.baselineRetry.baselineWindowOrThresholdChanged,false);
  assert.equal(b.publicAcceptance,false);assert.equal(b.speedGainProven,false);
});
test("successful retry removes adverse partial media and owned roots; obsolete lazy static copy retired with source recovery",async()=>{
  const b=await json(base+"-attempt2.json");
  for(const c of b.recovery.cases) {
    assert.equal(c.passed,true);assert.equal(c.opfsRemoved,true);assert.equal(c.outputRemoved,true);assert.equal(c.result.cleanupComplete,true);
    if(c.requestedFault){assert.equal(c.result.qualificationFaultTriggered,true);assert.equal(c.browserOutputBytes,0);}
  }
  assert.equal(b.ownedRuntimeRemoved,true);assert.equal(b.ownedStaticStageRemoved,true);
  assert.ok(b.processCleanup.length===3&&b.processCleanup.every(c=>c.status==="owned-identity-absent"));
  assert.deepEqual(b.originalBefore,b.originalAfter);assert.deepEqual(b.forbiddenRequests,[]);
  const raw=gunzipSync(await read(b.rawArchive.file),{maxOutputLength:4194304});assert.equal(raw.length,635016);
  assert.equal(createHash("sha256").update(raw).digest("hex"),b.rawArchive.decodedSha256);
  const archive=await json("evidence/2026-11-06-vp9-token-qualification-control-42226266102-attempt2-archive.json");assert.equal(archive.retainedBytes,283969);
  const cleanup=await json("evidence/2026-11-06-vp9-lazy-superseded-input-cleanup.json");
  assert.equal(cleanup.files,31);assert.equal(cleanup.bytes,11505667);assert.equal(cleanup.removed,true);
  assert.equal(cleanup.sourcePreimagesRetainedWithReplacement,true);assert.equal(cleanup.userMediaReadOrRemoved,false);
});
