import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectCompositedFullTerminal } from "../scripts/lib/composited-handoff-full-terminal.mjs";
const root=path.resolve(import.meta.dirname,"..");
async function actual() {
  const terminal=JSON.parse(await readFile(path.join(root,"evidence/2026-10-15T17-48-11-250Z-composited-handoff-original-full-terminal.json")));
  const report=JSON.parse(gunzipSync(await readFile(path.join(root,terminal.candidate.compressedReport.path))));return{terminal,report};
}
test("actual full browser file save/observed memory pass remains a validator failure with0 accepted repeats",async()=>{
  const {terminal,report}=await actual(),analysis=inspectCompositedFullTerminal(terminal,report);
  assert.equal(analysis.outputBytes,6414309978);assert.equal(analysis.primaryMemory.incrementalPrivateMiB,225.359375);
  assert.equal(analysis.browserEncodeAndSaveCompleted,true);assert.equal(analysis.independentValidationCompleted,false);
  assert.equal(analysis.timeoutCauseIsInferenceNotProven,true);assert.equal(analysis.fullOriginalAcceptance,false);
});
test("reject fake acceptance, hidden memory failures, changed frames, lost samples, weakened cleanup and network disclosure",async()=>{
  const source=await actual();
  for(const mutate of [
    value=>{value.terminal.candidate.completedConversions=1;},value=>{value.report.runs[0].independentValidation={passed:true};},
    value=>{value.report.runs[0].incrementalPrivateMiB=258;},value=>{value.report.splitFinalSamples[0].frames--;},
    value=>{value.report.nativeMemory.receiptClockFence.samplesDropped=1;},value=>{value.report.cleanup.mediaProfileRuntimeRemoved=false;},
    value=>{value.report.forbiddenRequests.push({method:"POST"});},value=>{value.report.runs[0].state.metrics.peakWasmMemoryBytes=0;},
  ]){const changed=structuredClone(source);mutate(changed);assert.throws(()=>inspectCompositedFullTerminal(changed.terminal,changed.report));}
});
