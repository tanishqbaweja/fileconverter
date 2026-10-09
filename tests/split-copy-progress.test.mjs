// Source/timing bookkeeping ONLY, not conversion or memory acceptance.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { makeSplitCopySession } from "../scripts/lib/split-copy-layout-recipe.mjs";
import { makeSplitCopyProgressDriver } from "../scripts/lib/split-copy-progress-recipe.mjs";
import { makeSplitCopyController } from "../scripts/lib/split-copy-controller-recipe.mjs";
import { recordOutputWorkCheckpoint,compareOutputWorkWindows } from "../scripts/lib/split-copy-work-checkpoints.mjs";
import { baselineBinding } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file),"utf8");
const executed=JSON.parse(gunzipSync(await readFile(path.join(root,"outputs/reports/2026-10-08T22-04-15-944Z-ui-progress-baseline-executed-sources.json.gz"))));
const syntax=source=>{const result=spawnSync(process.execPath,["--check","--input-type=module"],{input:source,encoding:"utf8",windowsHide:true});assert.equal(result.status,0,result.stderr);};
test("Both exact full-source drivers keep same normal UI/64MiB/300s/fidelity/three-run/all-process gates; only candidate transport changes",()=>{
  for(const mode of["baseline","candidate"]){
    const recipe=makeSplitCopyProgressDriver(executed.generated,root,"file:///UNIT_ONLY/trace.mjs",baselineBinding,mode);syntax(recipe.generated);
    let source=recipe.generated;for(const[before,after]of recipe.patches.toReversed())source=source.replaceAll(after,before);assert.equal(source,recipe.previous.generated);
    const config=JSON.parse(recipe.generated.match(/^const progressProbe = (.*);$/m)[1]);
    assert.equal(config.checkpointOutputBytes,67108864);assert.equal(config.maximumConversionMs,300000);assert.deepEqual(config.expectedAsset,baselineBinding);
    assert.equal(config.jsAllocationSamplingEnabled,false);assert.ok(recipe.generated.includes('"--headless=new"'));
    assert.ok(recipe.generated.includes('assert.equal(run.state.jobState, "complete",'));
    assert.equal(/\["scripts\/stage-split-copy-layout\.mjs",\s*"stage"\]/.test(recipe.generated),mode==="candidate");
  }
});
test("Controller preserves fresh guards, hidden launches, sequential children and normal restoration without any UI rebuild",async()=>{
  const recipe=makeSplitCopyController(await read("scripts/diagnose-split-render-progress.mjs"),root);syntax(recipe.generated);
  assert.ok(!recipe.generated.includes('"scripts/build-split-render-ui-candidate.mjs",stamp,"--for-browser"'));
  assert.ok(recipe.generated.includes("const candidateBinding=baselineBinding"));
  assert.ok(recipe.generated.includes("WITHIN_SPLIT_COPY_STATE_DIR:runtime.directory"));
  assert.ok(recipe.generated.includes("diskBytes>=32*1024**3")&&recipe.generated.includes("fresh.safeToStart,true"));
  assert.ok(recipe.generated.includes('assert.equal(code,1')&&recipe.generated.includes('"node_modules/vinext/dist/cli.js","build"'));
});
test("One successful frame records ONLY bounded scalar layout, after same copied/native encode success; no media view or history",async()=>{
  const source=await read("scripts/lib/mpeg2-split-session.mjs"),recipe=makeSplitCopySession(source);syntax(recipe.generated);
  assert.equal(recipe.patches.length,6);assert.ok(recipe.generated.includes("if (firstFrameCopyLayout === null)"));
  assert.ok(recipe.generated.indexOf('success(encoder._within_split_encoder_send(c), "send")')<recipe.generated.indexOf("if (firstFrameCopyLayout === null)"));
  assert.doesNotMatch(recipe.generated.match(/if \(firstFrameCopyLayout === null\)[\s\S]*?scope:.*?\}\);/)[0],/HEAP|buffer|subarray|pixels|\.push/);
});
test("4/8MiB are additional actual brackets only; no lower stopping gate or fabricated unavailable timing",()=>{
  const state=()=>({workCheckpoints:[],lastProgressObservation:null,unavailableProgressSamples:0}),a=state(),b=state();
  const sample=(probe,outputBytes,elapsedMs)=>recordOutputWorkCheckpoint(probe,{jobState:"running",metrics:{inputBytes:outputBytes+10,outputBytes,elapsedMs}});
  recordOutputWorkCheckpoint(a,{jobState:"running",metrics:null});assert.equal(a.unavailableProgressSamples,1);
  sample(a,4000000,10);sample(a,4200000,12);sample(b,4000000,8);sample(b,4200000,9);
  const windows=compareOutputWorkWindows(a.workCheckpoints,b.workCheckpoints);assert.equal(windows[0].thresholdBytes,4194304);
  assert.deepEqual(windows[0].candidateMinusBaselineMs,[-4,-1]);assert.equal(windows[0].status,"candidate-earlier-window");
  assert.equal(windows.length,5);assert.ok(windows.slice(1).every(row=>row.status==="unavailable"&&row.candidateMinusBaselineMs===null));
});
