// Synthetic inputs below exercise timing-bracket bookkeeping only, not conversions.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { makeSplitRenderProgressDriver,makeSplitRenderProgressTraceHelper } from "../scripts/lib/split-render-progress-recipe.mjs";
import { baselineBinding,sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { recordOutputWorkCheckpoint,compareOutputWorkWindows,OUTPUT_WORK_CHECKPOINTS } from "../scripts/lib/output-work-checkpoints.mjs";
const root=path.resolve(import.meta.dirname,".."),bytes=await readFile(path.join(root,"outputs/reports/2026-10-08T22-04-15-944Z-ui-progress-baseline-executed-sources.json.gz"));
assert.equal(sha(bytes),"5111278bc1b5bbe47585679fda04a351e6885aa6974def53663800a81b8bc695");const executed=JSON.parse(gunzipSync(bytes));
const build=JSON.parse(await readFile(path.join(root,"evidence/2026-10-08T23-16-24-605Z-split-render-ui-build.json")));
test("Actual archived driver derivative preserves exact conversion gates, disabled JS allocation sampling and headless all-process measurements",()=>{
  for(const [mode,binding] of [["baseline",baselineBinding],["candidate",build.asset]]){
    const recipe=makeSplitRenderProgressDriver(executed.generated,root,"file:///UNIT_ONLY/helper.mjs",binding,mode);
    let recovered=recipe.generated;for(const [before,after] of recipe.patches.toReversed())recovered=recovered.replace(after,before);
    assert.equal(recovered,executed.generated);assert.ok(recipe.generated.includes('"checkpointOutputBytes":67108864')&&recipe.generated.includes('"maximumConversionMs":300000'));
    assert.ok(recipe.generated.includes('assert.ok(run.incrementalPrivateMiB <= 250')&&recipe.generated.includes('assert.equal(run.state.jobState, "complete"'));
    assert.ok(recipe.generated.includes('const diagnosticOnly = false')&&recipe.generated.includes('expectedSourceBytes = 2958573265'));
  }
  const helper=makeSplitRenderProgressTraceHelper(executed.traceHelper,path.join(root,"outputs/reports/UNIT_ONLY-not-created.json.gz"));
  assert.ok(helper.includes("maximumSerializedBytes: 16777216"));
  assert.throws(()=>makeSplitRenderProgressDriver(executed.generated+" ",root,"x",build.asset,"candidate"));
});
test("Work checkpoints use bounded actual observation brackets, with unavailable values never replaced by zero",()=>{
  const probe={workCheckpoints:[],lastProgressObservation:null,unavailableProgressSamples:0};
  recordOutputWorkCheckpoint(probe,{jobState:"running",metrics:null});assert.equal(probe.unavailableProgressSamples,1);
  const state=(outputBytes,elapsedMs)=>({jobState:"running",metrics:{outputBytes,inputBytes:outputBytes+123,elapsedMs}});
  recordOutputWorkCheckpoint(probe,state(100,1000));recordOutputWorkCheckpoint(probe,state(OUTPUT_WORK_CHECKPOINTS[2]+123,2000));
  assert.equal(probe.workCheckpoints.length,3);assert.ok(probe.workCheckpoints.every(row=>row.lowerElapsedMs===1000&&row.upperElapsedMs===2000&&row.crossingTimeIsExact===false));
  recordOutputWorkCheckpoint(probe,state(OUTPUT_WORK_CHECKPOINTS[2]+456,3000));assert.equal(probe.workCheckpoints.length,3);
  assert.throws(()=>recordOutputWorkCheckpoint(probe,state(1,4000)),/nonmonotonic/);
  assert.ok(compareOutputWorkWindows(probe.workCheckpoints,probe.workCheckpoints).every(row=>row.status==="overlapping-windows"));
  assert.ok(compareOutputWorkWindows([],probe.workCheckpoints).every(row=>row.status==="unavailable"&&row.candidateMinusBaselineMs===null));
  const first={workCheckpoints:[],lastProgressObservation:null,unavailableProgressSamples:0};recordOutputWorkCheckpoint(first,state(OUTPUT_WORK_CHECKPOINTS[2],1));
  assert.ok(first.workCheckpoints.every(row=>row.before===null&&row.lowerElapsedMs===null));
});
