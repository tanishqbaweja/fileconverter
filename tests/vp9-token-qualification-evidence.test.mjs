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
