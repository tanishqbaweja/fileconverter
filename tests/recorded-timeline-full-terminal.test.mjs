import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {gunzipSync} from "node:zlib";
import test from "node:test";
import {inspectRecordedTimelineFullTerminal} from "../scripts/lib/recorded-timeline-full-terminal.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const terminal=JSON.parse(await read("evidence/2026-10-16T21-31-52-360Z-recorded-timeline-full-terminal.json"));
const report=JSON.parse(gunzipSync(await read(terminal.report.path),{maxOutputLength:33554432}));
test("real full fidelity success does not conceal second-repeat memory failure",()=>{
  const result=inspectRecordedTimelineFullTerminal(terminal,report);
  assert.equal(result.independentlyValidatedRuns,1);assert.equal(result.first.ssim,.989565);
  assert.equal(result.first.incrementalPrivateMiB,224.11328125);assert.equal(result.second.incrementalPrivateMiB,268.9609375);
  assert.equal(result.repeatabilityAcceptance,false);assert.equal(result.failureBoundary.exactAllocationSource,null);
});
test("refuse weaker quality, hidden samples, discarded processes or invented repeat success",()=>{
  for(const mutate of [value=>{value.runs[0].independentValidation.ssim=.97;},value=>{value.runs[0].independentValidation.maximumTimestampErrorSeconds=.002;},
    value=>{value.runs[1].incrementalPrivateMiB=249;},value=>{value.nativeMemory.phases.find(row=>row.phase==="conversion-2").unavailableSamples=1;},
    value=>{value.runs[1].independentValidation={passed:true};},value=>{value.nativeFailureCapture.firstFailure.delta.allocationSource="guessed allocator";}]) {
    const changed=structuredClone(report);mutate(changed);assert.throws(()=>inspectRecordedTimelineFullTerminal(terminal,changed));
  }
});
