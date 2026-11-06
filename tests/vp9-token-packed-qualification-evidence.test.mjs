import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),sha=b=>createHash("sha256").update(b).digest("hex"),
  base="evidence/2026-11-06-vp9-token-packed-qualification-42244170876",r=await json(base+".json"),
  expected="82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b";
test("actual packed-token CPU outputs remain bit-identical to unmodified golden and pass strict independent timing/metadata/fidelity",()=>{
  assert.equal(r.executedHead,"959a6437a08f773a9886e70e7b02bd2bc26a81e4");assert.equal(r.status,"passed-private-vp9-recovery-sequence-not-large-or-public-acceptance");
  assert.deepEqual(r.failures,[]);assert.equal(r.privateCpuOverride.runId,42244170876);assert.equal(r.temporalAllocationGuard.tokenPackedStorage,true);
  assert.equal(r.browserResult.selection.backend,"wasm");assert.equal(r.browserResult.metrics.outputBytes,99413);
  const outputs=[{outputSha256:r.outputSha256,validation:r.independentFidelity},...r.recovery.cases.filter(c=>c.validation)];assert.equal(outputs.length,4);
  for(const c of outputs) {
    assert.equal(c.outputSha256,expected);assert.equal(c.validation.passed,true);assert.equal(c.validation.clocks.frames,48);
    assert.equal(c.validation.clocks.maximumVideoPtsErrorSeconds,0);assert.equal(c.validation.outputFrames.framesWithDuration,48);
    assert.equal(c.validation.containerDuration.errorSeconds,0);assert.equal(c.validation.ssim.score,0.993273);
    assert.ok(c.validation.metadata.length===8&&c.validation.metadata.every(m=>m.equal));
  }
  assert.equal(r.storedTiming.explicitDefaultDurationGatePassed,true);assert.equal(r.speedGainProven,false);assert.equal(r.publicAcceptance,false);
});
test("actual same-blank whole-Chrome peak and adverse recovery pass with all owned media/profiles/processes removed",()=>{
  assert.equal(r.blankBaseline.privateBytes,352567296);assert.equal(r.memory.peak.privateBytes,599126016);
  assert.equal(r.memory.incrementalPrivateMiB,235.13671875);assert.equal(r.memory.validSamples,247);assert.equal(r.memory.unavailableSamples,0);
  assert.equal((r.memory.peak.privateBytes-r.blankBaseline.privateBytes)/1048576,r.memory.incrementalPrivateMiB);
  assert.equal(r.recovery.passed,true);assert.equal(r.recovery.cases.length,5);
  for(const c of r.recovery.cases) {
    assert.equal(c.passed,true);assert.equal(c.opfsRemoved,true);assert.equal(c.outputRemoved,true);assert.equal(c.result.cleanupComplete,true);
    if(c.requestedFault){assert.equal(c.result.qualificationFaultTriggered,true);assert.equal(c.browserOutputBytes,0);}
  }
  assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);assert.ok(r.processCleanup.every(p=>p.status==="owned-identity-absent"));
  assert.deepEqual(r.originalBefore,r.originalAfter);assert.equal(r.originalAfter.bytes,2958573265);
  assert.equal(r.originalAfter.sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");assert.deepEqual(r.forbiddenRequests,[]);
});
test("packed initial control required strict baseline before app, and retained raw diagnostics round-trip exactly",async()=>{
  const recipe=await json(base+"-recipe.json");assert.equal(recipe.tokenPacked,true);assert.equal(recipe.baselineRetry,null);
  const generated=gunzipSync(Buffer.from(recipe.generatedSourceGzipBase64,"base64"),{maxOutputLength:1048576});assert.equal(sha(generated),recipe.generatedSha256);
  assert.ok(generated.toString().includes("Stable blank required before loading the app"));assert.equal(recipe.changesBaselineFormulaOrLimit,false);
  const packed=await read(r.rawArchive.file),raw=gunzipSync(packed,{maxOutputLength:4194304});assert.equal(sha(packed),r.rawArchive.sha256);
  assert.equal(sha(raw),r.rawArchive.decodedSha256);assert.equal(raw.length,598534);
  const archive=await json("evidence/2026-11-06-vp9-token-packed-qualification-control-42244170876-archive.json");
  assert.equal(archive.retainedBytes,273674);assert.equal(archive.allRoundtripsVerified,true);
});
