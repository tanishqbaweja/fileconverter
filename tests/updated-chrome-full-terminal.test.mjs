import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {gunzipSync} from "node:zlib";
import test from "node:test";
import {inspectUpdatedChromeFullTerminal} from "../scripts/lib/updated-chrome-full-terminal.mjs";
const root=path.resolve(import.meta.dirname,".."),terminal=JSON.parse(await readFile(path.join(root,"evidence/2026-10-16T17-01-47-260Z-updated-chrome-full-terminal.json")));
const report=JSON.parse(gunzipSync(await readFile(path.join(root,terminal.report.path)),{maxOutputLength:33554432}));
test("actual full output and memory observation do not become a fidelity or repeatability pass",()=>{
  const result=inspectUpdatedChromeFullTerminal(terminal,report);
  assert.equal(result.outputBytes,6414309978);assert.equal(result.observedIncrementalPrivateMiB,221.13671875);
  assert.equal(result.exactMismatchCause,null);assert.equal(result.independentlyAcceptedRuns,0);
  assert.equal(result.fullSsimReached,false);
});
test("reject hidden sample failures, reduced frame counts or invented validation success",()=>{
  for(const change of [value=>{value.nativeMemory.phases.find(row=>row.phase==="conversion-1").unavailableSamples=1;},
    value=>{value.runs[0].independentPreAssertionProbe.streams[0].nb_read_frames="21611";},
    value=>{value.runs[0].independentValidation={passed:true};},value=>{value.failure=null;}]) {
    const value=structuredClone(report);change(value);assert.throws(()=>inspectUpdatedChromeFullTerminal(terminal,value));
  }
});
