// Replay retained facts only. These tests never launch Chromium or certify a conversion.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { splitRenderNativeFacts,splitRenderFirstFailureFacts } from "../scripts/lib/split-render-progress-evidence.mjs";
import { recordOutputWorkCheckpoint,compareOutputWorkWindows } from "../scripts/lib/output-work-checkpoints.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const prefix="evidence/2026-10-08T23-33-58-528Z-split-render-progress";
const receiptBytes=await read(prefix+".json"),receipt=JSON.parse(receiptBytes);
const proof=JSON.parse(await read(prefix+"-analysis.json"));
const raws=[];
for(const run of receipt.executions){
  const gzip=await read(run.compressedReport.path);assert.equal(gzip.length,run.compressedReport.bytes);assert.equal(sha(gzip),run.compressedReport.sha256);
  const bytes=gunzipSync(gzip,{maxOutputLength:32*1048576});assert.equal(bytes.length,run.rawReport.bytes);assert.equal(sha(bytes),run.rawReport.sha256);raws.push(JSON.parse(bytes));
}
test("Actual terminal pair reconstructs exact late-inclusive all-tree failures, including candidate CIM peak",async()=>{
  assert.equal(proof.receipt.sha256,sha(receiptBytes));assert.equal(proof.receipt.bytes,receiptBytes.length);
  for(const [file,hash] of Object.entries(proof.verifierPins))assert.equal(sha(await read(file)),hash);
  assert.deepEqual(raws.map((raw,index)=>splitRenderNativeFacts(raw,receipt.executions[index].mode)),proof.nativeFacts);
  assert.deepEqual(proof.nativeFacts.map(r=>[r.blankPrivateBytes,r.actualPeakPrivateBytes,r.observedIncrementalPrivateMiB]),
    [[243879936,522616832,265.82421875],[240975872,514228224,260.59375]]);
  for(const raw of raws){
    const samples=raw.samples.filter(r=>/^pre-conversion-|^conversion-/.test(r.phase)&&r.privateBytes!==null);
    for(const row of samples){
      assert.equal(row.processes.reduce((sum,p)=>sum+p.privateBytes,0),row.privateBytes);
      assert.ok(row.processes.some(p=>p.pid===raw.ownedPids.chrome));
    }
    assert.equal(Math.max(...samples.map(r=>r.privateBytes)),raw.runs[0].cimPeakPrivateBytes);
  }
  assert.equal(proof.conversionsCompleted,0);assert.equal(proof.completeOutputsIndependentlyValidated,0);
  for(const key of ["conversionSpeedAcceptance","completeChromiumMemoryAcceptance","publicAcceptance","originalFullSourceAcceptance","nativeAllocationCauseProven"])
    assert.equal(proof[key],false);
});
test("Actual before/after work brackets and missing post-cancel capture remain unavailable, not invented timing or cause",()=>{
  const reconstructed=raws.map(raw=>{
    const state={workCheckpoints:[],lastProgressObservation:null,unavailableProgressSamples:0};
    for(const row of raw.samples.filter(r=>r.phase==="conversion-1"))recordOutputWorkCheckpoint(state,{jobState:row.jobState,metrics:row.metrics});
    assert.deepEqual(state.workCheckpoints,raw.progressProbe.workCheckpoints);return state.workCheckpoints;
  });
  assert.equal(reconstructed[0].length,1);assert.equal(reconstructed[1].length,0);
  assert.deepEqual(compareOutputWorkWindows(...reconstructed),proof.workWindows);
  assert.ok(proof.workWindows.every(row=>row.status==="unavailable"&&row.candidateMinusBaselineMs===null));
  const failures=raws.map((raw,index)=>({mode:receipt.executions[index].mode,...splitRenderFirstFailureFacts(raw)}));
  assert.deepEqual(failures,proof.firstFailureFacts);
  assert.equal(failures[0].firstFailure.delta.treeDeltaPrivateBytes,55955456);
  assert.equal(failures[0].firstFailure.processChanges.find(p=>p.deltaPrivateBytes>0).cimObservedType,"renderer");
  assert.equal(failures[0].firstFailure.precedesPostCancelDump,true);
  assert.equal(failures[1].firstFailure.normalCancellationStartedAt,null);
  assert.equal(failures[1].firstFailure.precedesPostCancelDump,null);
  assert.equal(failures[1].firstFailure.postCancelCaptureStatus,"not-captured-after-finalization-start");
  const missing=structuredClone(raws[1]);missing.nativeFailureCapture.callback.status="completed";
  assert.throws(()=>splitRenderFirstFailureFacts(missing));
});
