import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),
  base="evidence/2026-11-06-webcodecs-vp9-original-qualification-42231818045",r=await json(base+".json");
test("actual platform core encodes four48-frame outputs with strict full-content/clock/metadata fidelity, not CPU fallback or GPU proof",()=>{
  assert.equal(r.executedHead,"8bd8d687117a1e2a3092c2bca9d3f0f4f437bde3");assert.equal(r.nativeTool.runId,42231818045);
  assert.equal(r.status,"passed-private-vp9-recovery-sequence-not-large-or-public-acceptance");assert.deepEqual(r.failures,[]);
  assert.equal(r.platformEncoderOnly,true);assert.equal(r.recovery.backend,"platform");assert.equal(r.recovery.passed,true);
  const outputs=[{result:r.browserResult,outputSha256:r.outputSha256,validation:r.independentFidelity},...r.recovery.cases.filter(c=>c.validation)];
  assert.equal(outputs.length,4);for(const c of outputs) {
    assert.equal(c.outputSha256,"1fba59187d8111779053fcfe00a00d79ad829638dd4eec8ffa6bf67ef9a653f9");
    assert.equal(c.result.selection,null);assert.equal(c.result.encoder.frames,48);assert.equal(c.result.encoder.packets,48);assert.equal(c.result.encoder.framesClosed,48);
    assert.equal(c.result.encoder.supportProbeCount,2);assert.equal(c.result.encoder.hardwarePreferredSupported,false);
    assert.equal(c.result.encoder.selectedHardwarePreference,"no-preference");assert.equal(c.result.encoder.physicalHardwareSelectionProven,false);
    assert.equal(c.validation.passed,true);assert.equal(c.validation.clocks.maximumVideoPtsErrorSeconds,0);
    assert.equal(c.validation.clocks.frames,48);assert.equal(c.validation.ssim.score,0.993428);assert.equal(c.validation.containerDuration.errorSeconds,0);
    assert.ok(c.validation.metadata.length===8&&c.validation.metadata.every(m=>m.equal));
  }
  assert.equal(r.storedTiming.explicitDefaultDurationGatePassed,true);assert.equal(r.storedTiming.output.tracks[0].defaultDurationNs,41666666);
});
test("same blank whole-process-tree formula passes small recovery while every owned output/profile is removed",async()=>{
  assert.equal(r.blankBaseline.privateBytes,352800768);assert.equal(r.memory.peak.privateBytes,534151168);
  assert.equal(r.memory.incrementalPrivateMiB,172.94921875);assert.equal(r.memory.validSamples,60);assert.equal(r.memory.unavailableSamples,0);
  assert.equal(r.memory.incrementalPrivateMiB,(r.memory.peak.privateBytes-r.blankBaseline.privateBytes)/1048576);
  for(const c of r.recovery.cases){assert.equal(c.passed,true);assert.equal(c.opfsRemoved,true);assert.equal(c.outputRemoved,true);assert.equal(c.result.cleanupComplete,true);
    if(c.requestedFault){assert.equal(c.result.qualificationFaultTriggered,true);assert.equal(c.browserOutputBytes,0);}}
  assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);assert.ok(r.processCleanup.every(p=>p.status==="owned-identity-absent"));
  assert.deepEqual(r.originalBefore,r.originalAfter);assert.deepEqual(r.forbiddenRequests,[]);assert.equal(r.speedGainProven,false);assert.equal(r.publicAcceptance,false);
  const raw=gunzipSync(await read(r.rawArchive.file),{maxOutputLength:4194304});assert.equal(raw.length,530285);
  assert.equal(createHash("sha256").update(raw).digest("hex"),r.rawArchive.decodedSha256);
  assert.equal((await json("evidence/2026-11-06-webcodecs-vp9-original-qualification-control-42231818045-archive.json")).retainedBytes,262008);
});
