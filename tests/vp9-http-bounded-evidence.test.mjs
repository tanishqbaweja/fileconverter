import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {gunzipSync} from "node:zlib";
const read=f=>readFile(new URL("../"+f,import.meta.url)),json=async f=>JSON.parse(await read(f)),sha=b=>createHash("sha256").update(b).digest("hex"),
  base="evidence/2026-11-06-vp9-token-packed-http-qualification-42244170876-attempt2",r=await json(base+".json");
test("actual HTTP/bounded-trace control preserves four golden outputs, strict fidelity/recovery and exact all-process memory formula",()=>{
  assert.equal(r.executedHead,"f915a0e40c9b8ece6a3d1bbc5e635f850993773a");assert.equal(r.status,"passed-private-vp9-recovery-sequence-not-large-or-public-acceptance");assert.deepEqual(r.failures,[]);
  const outputs=[{outputSha256:r.outputSha256,validation:r.independentFidelity},...r.recovery.cases.filter(c=>c.validation)];assert.equal(outputs.length,4);
  for(const c of outputs){assert.equal(c.outputSha256,"82bdfd66b2411c9d9e3e8ccf24659fce9f6aa5527b4066b219238e8f7e82267b");
    assert.equal(c.validation.passed,true);assert.equal(c.validation.clocks.frames,48);assert.equal(c.validation.clocks.maximumVideoPtsErrorSeconds,0);
    assert.equal(c.validation.outputFrames.framesWithDuration,48);assert.equal(c.validation.ssim.score,0.993273);assert.ok(c.validation.metadata.every(m=>m.equal));}
  assert.equal(r.storedTiming.explicitDefaultDurationGatePassed,true);assert.equal(r.blankBaseline.privateBytes,346501120);assert.equal(r.memory.peak.privateBytes,560128000);
  assert.equal(r.memory.incrementalPrivateMiB,203.73046875);assert.equal(r.memory.validSamples,79);assert.equal(r.memory.unavailableSamples,0);
  assert.equal((r.memory.peak.privateBytes-r.blankBaseline.privateBytes)/1048576,r.memory.incrementalPrivateMiB);assert.equal(r.publicAcceptance,false);
});
test("bounded trace retains real screenshot/API evidence but no Wasm bodies/DOM snapshots; actual HTTP headers/hashes and cleanup pass",async()=>{
  const v=await json("evidence/2026-11-06-vp9-http-bounded-verification.json");assert.equal(v.trace.apiTimelineVerified,true);assert.equal(v.trace.eventTypes.before,66);
  assert.equal(v.trace.screenshotMembers,5);assert.equal(v.trace.wasmBodies,0);assert.equal(v.trace.domSnapshots,0);assert.equal(v.domOrManualUiCoverageClaimed,false);
  assert.equal(sha(await read(r.boundedDiagnosticTrace.path)),r.boundedDiagnosticTrace.sha256);assert.equal(r.networkMetadata.length,32);
  assert.deepEqual(r.privateCpuOverride.served,{javascript:6,wasm:6});assert.deepEqual(r.privateCpuOverride.errors,[]);assert.equal(r.privateCpuOverride.devtoolsResponseBodyUsed,false);
  assert.equal(r.privateCpuOverride.stageRemoved,true);assert.equal(r.ownedRuntimeRemoved,true);assert.equal(r.ownedStaticStageRemoved,true);
  for(const c of r.recovery.cases){assert.equal(c.passed,true);assert.equal(c.opfsRemoved,true);assert.equal(c.outputRemoved,true);if(c.requestedFault)assert.equal(c.browserOutputBytes,0);}
  assert.ok(r.processCleanup.every(x=>x.status==="owned-identity-absent"));assert.deepEqual(r.originalBefore,r.originalAfter);assert.deepEqual(r.forbiddenRequests,[]);
});
test("failed first HTTP receipt remains failed and authenticated by the distinct bounded-trace recipe; raw diagnostics round-trip",async()=>{
  const recipe=await json(base+"-recipe.json"),prior=await read(recipe.priorHttpFailure.file);assert.equal(sha(prior),recipe.priorHttpFailure.sha256);
  assert.equal(JSON.parse(prior).status,"failed-private-vp9-browser-smoke");assert.equal(recipe.boundedTrace,true);assert.equal(recipe.changesMemoryFormulaOrLimit,false);
  assert.equal(recipe.changesInputOrEncodingSettings,false);const raw=gunzipSync(await read(r.rawArchive.file),{maxOutputLength:4194304});assert.equal(sha(raw),r.rawArchive.decodedSha256);
  const archive=await json("evidence/2026-11-06-vp9-token-packed-http-qualification-control-42244170876-attempt2-archive.json");assert.equal(archive.retainedBytes,289775);assert.equal(archive.allRoundtripsVerified,true);
});
