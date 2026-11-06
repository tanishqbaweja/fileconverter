import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),
  base="evidence/2026-11-06-vp9-lazy-qualification-42218018139",r=await json(base+".json"),
  expected="82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b";
test("actual lazy codec preserves four byte-identical completed outputs and strict independent fidelity",()=>{
  assert.equal(r.executedHead,"e649bf6e62ba3e09da4cca6de61a631094e4de02");assert.equal(r.privateCpuOverride.runId,42218018139);
  assert.equal(r.status,"passed-private-vp9-recovery-sequence-not-large-or-public-acceptance");assert.deepEqual(r.failures,[]);
  assert.equal(r.temporalAllocationGuard.lazyUtilityStorage,true);assert.equal(r.recovery.passed,true);
  const outputs=[{outputSha256:r.outputSha256,validation:r.independentFidelity},...r.recovery.cases.filter(c=>c.validation)];
  assert.equal(outputs.length,4);
  for(const c of outputs){assert.equal(c.outputSha256,expected);assert.equal(c.validation.passed,true);
    assert.equal(c.validation.clocks.frames,48);assert.equal(c.validation.clocks.maximumVideoPtsErrorSeconds,0);
    assert.equal(c.validation.outputFrames.framesWithDuration,48);assert.equal(c.validation.containerDuration.errorSeconds,0);
    assert.equal(c.validation.ssim.score,0.993273);assert.ok(c.validation.metadata.length===8&&c.validation.metadata.every(m=>m.equal));}
});
test("actual adverse paths recover below same whole-Chrome gate and remove owned media/profile/processes",async()=>{
  assert.equal(r.blankBaseline.privateBytes,351117312);assert.equal(r.memory.peak.privateBytes,587759616);
  assert.equal(r.memory.incrementalPrivateMiB,225.6796875);assert.equal(r.memory.validSamples,214);assert.equal(r.memory.unavailableSamples,0);
  assert.equal(r.memory.incrementalPrivateMiB,(r.memory.peak.privateBytes-r.blankBaseline.privateBytes)/1048576);
  for(const c of r.recovery.cases){assert.equal(c.passed,true);assert.equal(c.opfsRemoved,true);assert.equal(c.outputRemoved,true);
    assert.equal(c.result.cleanupComplete,true);if(c.requestedFault){assert.equal(c.result.qualificationFaultTriggered,true);assert.equal(c.browserOutputBytes,0);}}
  assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);
  assert.ok(r.processCleanup.length===3&&r.processCleanup.every(c=>c.status==="owned-identity-absent"));
  assert.deepEqual(r.originalBefore,r.originalAfter);assert.deepEqual(r.forbiddenRequests,[]);assert.equal(r.speedGainProven,false);assert.equal(r.publicAcceptance,false);
  const raw=gunzipSync(await read(r.rawArchive.file),{maxOutputLength:4194304});assert.equal(raw.length,613030);
  assert.equal(createHash("sha256").update(raw).digest("hex"),r.rawArchive.decodedSha256);
  const archive=await json("evidence/2026-11-06-vp9-lazy-qualification-control-42218018139-archive.json");
  assert.equal(archive.retainedBytes,272377);assert.equal(archive.allRoundtripsVerified,true);
});
