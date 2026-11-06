import assert from "node:assert/strict";
import {test} from "node:test";
import path from "node:path";
import {createPlatformVp9AllocationDiagnostic,PLATFORM_ALLOCATION_PHASES} from "../scripts/lib/platform-vp9-allocation-diagnostic.mjs";
const root=path.resolve(import.meta.dirname,".."),runId="42231818045";
function setup(overrides={}) {
  const calls=[],processes=[{pid:1,parentPid:0,createdAt:"mock-birth",privateBytes:100}],realmRows={targetsAvailable:false,targets:null};
  const diagnostic=createPlatformVp9AllocationDiagnostic({root,runId,
    realms:{sample:async()=>realmRows,close:()=>calls.push("close-realms")},
    sampleProcesses:async()=>({privateBytes:100,processes}),createSession:async()=>{calls.push("session");return {};},
    capture:async options=>{calls.push(options);return {acceptanceMetric:false,summedAllocatorTotal:null};},...overrides});
  return {diagnostic,calls,processes,realmRows};
}
test("four distinct allocation checkpoints retain all processes and unavailable realms without substituting for acceptance",async()=>{
  const {diagnostic,calls,processes,realmRows}=setup(),report=diagnostic.report();
  for(const phase of PLATFORM_ALLOCATION_PHASES)assert.equal(await diagnostic.capture(phase,{wasmMemoryBytes:33554432}),true);
  assert.equal(report.checkpoints.length,4);assert.equal(report.acceptanceMetric,false);assert.equal(report.perturbsMemoryAndTiming,true);
  assert.equal(report.noForcedGc,true);assert.equal(report.allocationStackAttribution,false);assert.equal(report.summedAllocatorTotal,null);
  assert.equal(report.maximumPending,1);assert.equal(report.queuedRequests,0);
  for(const [i,row]of report.checkpoints.entries()) {
    assert.deepEqual(row.processSample.processes,processes);assert.equal(row.realms,realmRows);assert.equal(row.error,null);assert.ok(row.finishedAt);
    const options=calls[i*2+1];assert.equal(options.captureMs,1500);
    assert.equal(options.archivePath,path.join(root,"evidence",`2026-11-06-webcodecs-vp9-original-allocation-${runId}-${row.label}.trace.json.gz`));
  }
  await assert.rejects(diagnostic.capture("loaded-idle"),/duplicate/);diagnostic.close();diagnostic.close();
  assert.equal(calls.filter(x=>x==="close-realms").length,1);await assert.rejects(diagnostic.capture("loaded-idle"),/closed/);
});
test("unselected/hostile label never starts observations",async()=>{
  const {diagnostic,calls}=setup();for(const label of ["output-closed","../../outside","unknown"])assert.equal(await diagnostic.capture(label),false);
  assert.deepEqual(calls,[]);assert.equal(diagnostic.report().checkpoints.length,0);diagnostic.close();
});
test("concurrent capture is rejected, not queued; close cannot strand capture",async()=>{
  let release,started;const ready=new Promise(resolve=>{started=resolve;});
  const {diagnostic}=setup({capture:async()=>{started();return new Promise(resolve=>{release=resolve;});}});
  const pending=diagnostic.capture("loaded-idle");await ready;
  await assert.rejects(diagnostic.capture("encoder-configured"),/overlap or queue/);assert.throws(()=>diagnostic.close(),/active capture/);
  release({acceptanceMetric:false});await pending;assert.equal(diagnostic.report().checkpoints.length,1);diagnostic.close();
});
test("failed OS observation preserves available realm observation and never creates native session",async()=>{
  const {diagnostic,calls,realmRows}=setup({sampleProcesses:async()=>{throw new Error("unavailable OS sample");}});
  await assert.rejects(diagnostic.capture("loaded-idle"),/unavailable/);const [row]=diagnostic.report().checkpoints;
  assert.equal(row.processSample,null);assert.equal(row.realms,realmRows);assert.ok(row.error);assert.equal(row.result,null);assert.deepEqual(calls,[]);diagnostic.close();
});
test("native capture failure remains explicit, cannot duplicate or replace evidence",async()=>{
  const {diagnostic}=setup({capture:async()=>{throw new Error("native trace unavailable");}});
  await assert.rejects(diagnostic.capture("first-frame-encoded"),/unavailable/);const [row]=diagnostic.report().checkpoints;
  assert.equal(row.result,null);assert.match(row.error,/native trace unavailable/);assert.ok(row.finishedAt);
  await assert.rejects(diagnostic.capture("first-frame-encoded"),/duplicate/);diagnostic.close();
});
test("invalid paths/run identities fail before observation",()=>{
  for(const runId of ["../outside","123","1".repeat(15)])assert.throws(()=>setup({runId}));
  assert.throws(()=>setup({root:"relative"}));
});
