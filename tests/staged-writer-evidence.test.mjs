import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { buildStagedWriterControl, summarizeStagedWriterTiming } from "../scripts/lib/staged-writer-control.mjs";
const sha=b=>createHash("sha256").update(b).digest("hex");
const bytes=await readFile("evidence/2026-11-16T23-24-56-258Z-staged-writer-control.json");
assert.equal(sha(bytes),"3464f0c369bfbb75a50fc90e87ec272debe62a74529da755c257cd797af21f74");
const r=JSON.parse(bytes),packed=await readFile(r.nativeArchive.file);assert.equal(sha(packed),r.nativeArchive.sha256);
const native=gunzipSync(packed,{maxOutputLength:4194304});assert.equal(sha(native),r.nativeArchive.decodedSha256);const samples=JSON.parse(native);
test("real interleaved saver comparison validates every output byte and rejects the proposed speedup",async()=>{
  assert.equal(r.status,"completed-no-meaningful-copy-speedup-candidate-not-accepted");
  assert.deepEqual(summarizeStagedWriterTiming(r.cases),r.timing);assert.equal(r.timing.matchedCopyTimingGatePassed,false);
  assert.ok(r.timing.relativeMedianImprovement<0);assert.equal(r.timing.conversionSpeedupProven,false);
  for(const c of r.cases){assert.equal(c.sourceBytes,268435439);assert.equal(c.outputSha256,"4ee320204a511fa0b7c667e8605b7070dbc3f90b722ab9c6b5368ccfae03cfd0");
    assert.equal(c.result.type,"complete");assert.equal(c.result.metrics.outputBytes,c.sourceBytes);assert.equal(c.result.metrics.scratchBytes,0);
    assert.equal(c.result.metrics.peakPendingOperations,1);assert.equal(c.result.metrics.peakQueuedBytes,524288);
    assert.equal(c.result.metrics.maxScratchReadChunkBytes,524288);assert.equal(c.result.metrics.maxWriteChunkBytes,524288);assert.equal(c.ownedFilesRemoved,true);}
  const rebuilt=await buildStagedWriterControl(process.cwd());for(const name of ["baseline","candidate"])assert.equal(rebuilt.arms[name].sha256,r.compiledArms[name].sha256);
  assert.equal(sha(await readFile("workers/staged-save-runtime.ts")),r.singleFactor.baselineRuntimeSha256,"Rejected code must not silently remain in production");
});
test("all native process sums, same-blank peak and original per-copy cleanup are independently replayed without rebasing",()=>{
  assert.equal(samples.length,r.nativeArchive.samples);
  for(const s of samples)if(s.privateBytes!==null)assert.equal(s.privateBytes,s.processes.reduce((n,p)=>n+p.privateBytes,0));
  // The conservative replay also includes the final loaded-idle window: never
  // narrower than the recorded control, and no high startup baseline is substituted.
  const active=samples.filter(s=>Date.parse(s.timestamp)>=Date.parse(r.loaded.lastTimestamp)&&Date.parse(s.timestamp)<=r.controlEnd&&s.privateBytes!==null);
  assert.ok(active.length>=r.memory.validSamples);const peak=Math.max(...active.map(s=>s.privateBytes));
  assert.equal(peak,r.memory.peakPrivateBytes);assert.equal((peak-r.blank.privateBytes)/1048576,39.640625);
  assert.equal(r.memory.incrementalPrivateMiB,39.640625);assert.ok(r.memory.incrementalPrivateMiB<=250);
  for(const c of r.cases){assert.equal((c.cleanup.privateBytes-r.loaded.privateBytes)/1048576,c.cleanupAboveLoadedMiB);assert.ok(c.cleanupAboveLoadedMiB<=96);}
});
test("initial worker setup failure and terminal cleanup remain honest; neither report is a video or public conversion pass",async()=>{
  const failed=JSON.parse(await readFile("evidence/2026-11-16T23-22-43-757Z-staged-writer-control.json"));
  assert.equal(failed.status,"failed-not-acceptance");assert.equal(failed.cases.filter(c=>c.result).length,0);
  for(const x of [failed,r]){assert.equal(x.headless,true);assert.equal(x.browserServicesDisabled,false);assert.equal(x.wholeGoalComplete,false);
    assert.equal(x.ownedRuntimeRemoved,true);assert.equal(x.birthCleanup.allObservedBirthsAbsent,true);assert.deepEqual(x.forbiddenRequests,[]);}
  assert.equal(r.birthCleanup.observedPidCount,44);assert.deepEqual(r.failures,[]);assert.deepEqual(r.browserErrors,[]);
});
