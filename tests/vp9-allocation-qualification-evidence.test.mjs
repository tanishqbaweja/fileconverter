import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { createHash } from "node:crypto";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),base="evidence/2026-11-06-vp9-allocation-qualification-42135708757",
  r=await json(base+".json"),expected="82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b";
test("actual diagnostic build completes strict small conversion and three byte-identical fully validated recoveries",()=>{
  assert.equal(r.executedHead,"934947814a3aa4cde47ce90bd7984f207c5bfe86");
  assert.equal(r.status,"passed-private-vp9-recovery-sequence-not-large-or-public-acceptance");assert.deepEqual(r.failures,[]);
  assert.equal(r.privateCpuOverride.runId,42135708757);assert.equal(r.temporalAllocationGuard.failureOnlyAllocationDiagnostics,true);
  assert.equal(r.temporalAllocationGuard.bitExactComparedWithUnmodifiedLibvpx,true);assert.equal(r.recovery.passed,true);
  const outputs=[{outputSha256:r.outputSha256,validation:r.independentFidelity},...r.recovery.cases.filter(c=>c.validation)];
  assert.equal(outputs.length,4);
  for(const row of outputs) {
    assert.equal(row.outputSha256,expected);assert.equal(row.validation.passed,true);assert.equal(row.validation.clocks.frames,48);
    assert.equal(row.validation.clocks.maximumVideoPtsErrorSeconds,0);assert.equal(row.validation.outputFrames.framesWithDuration,48);
    assert.equal(row.validation.containerDuration.errorSeconds,0);assert.equal(row.validation.ssim.score,0.993273);
    assert.ok(row.validation.metadata.length===8&&row.validation.metadata.every(m=>m.equal));
  }
});
test("actual adverse-write recovery keeps unchanged full-tree gate, cleans every output and retains exact archived raw data",async()=>{
  assert.equal(r.blankBaseline.privateBytes,355012608);assert.equal(r.memory.peak.privateBytes,601149440);
  assert.equal(r.memory.incrementalPrivateMiB,234.734375);assert.equal(r.memory.validSamples,223);assert.equal(r.memory.unavailableSamples,0);
  assert.equal(r.memory.incrementalPrivateMiB,(r.memory.peak.privateBytes-r.blankBaseline.privateBytes)/1048576);
  for(const c of r.recovery.cases) {assert.equal(c.passed,true);assert.equal(c.opfsRemoved,true);assert.equal(c.outputRemoved,true);
    assert.equal(c.result.cleanupComplete,true);if(c.requestedFault){assert.equal(c.result.type,"error");assert.equal(c.result.qualificationFaultTriggered,true);assert.equal(c.browserOutputBytes,0);}}
  assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);
  assert.ok(r.processCleanup.length===3&&r.processCleanup.every(c=>c.status==="owned-identity-absent"));
  assert.deepEqual(r.originalBefore,r.originalAfter);assert.deepEqual(r.forbiddenRequests,[]);assert.equal(r.publicAcceptance,false);assert.equal(r.speedGainProven,false);
  const raw=gunzipSync(await read(r.rawArchive.file),{maxOutputLength:4194304});assert.equal(raw.length,611110);
  assert.equal(createHash("sha256").update(raw).digest("hex"),r.rawArchive.decodedSha256);
  const archive=await json("evidence/2026-11-06-vp9-allocation-qualification-control-42135708757-archive.json");
  assert.equal(archive.retainedBytes,271683);assert.equal(archive.allRoundtripsVerified,true);
});
