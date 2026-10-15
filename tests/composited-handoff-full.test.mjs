import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { patchHandoffFullDriver,PREVIOUS_FULL,makeEbmlFullCaller,makeEbmlFullDriver,makeEbmlFullSupervisor } from "../scripts/lib/composited-handoff-full-recipe.mjs";
import { recordHandoffStageProgress } from "../scripts/lib/handoff-stage-progress.mjs";
import { captureLayeredFullSourcePins } from "../scripts/lib/composited-handoff-full-sources.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const root=path.resolve(import.meta.dirname,"..");
test("full driver changes lifecycle/actual UI binding only; original three repeats and primary gates remain",async()=>{
  const proof=JSON.parse(await readFile(path.join(root,PREVIOUS_FULL)));
  const previous=JSON.parse(gunzipSync(await readFile(path.join(root,proof.sourceArchive.path))));
  const build=JSON.parse(await readFile(path.join(root,"evidence/2026-10-15T17-15-11-444Z-composited-handoff-build.json")));
  const recipe=patchHandoffFullDriver(previous.generated,root,build.assets);
  const syntax=spawnSync(process.execPath,["--check","--input-type=module"],{input:recipe.generated,encoding:"utf8",windowsHide:true,timeout:5000});
  assert.equal(syntax.status,0,syntax.stderr);
  let reversed=recipe.generated;for(const [before,after]of recipe.edits.toReversed())reversed=reversed.replace(after,before);assert.equal(reversed,previous.generated);
  for(const token of ["number <= 3","run.incrementalPrivateMiB <= 250","minimumMs: 300000",
    "blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes","assert.equal(metrics.peakWasmMemoryBytes, 48 * MiB)",
    "assert.equal(metrics.wasmMemoryBytes, 0)","assert.equal(metrics.sharedArrayBufferBytes,4)",
    "21600000","2958573265","Native AVIO cap unchanged","metrics.peakPendingOperations <= 1",
    "handoffPhysicalReleaseProven=false","actualAssetResponse.body()"])
    assert.ok(recipe.generated.includes(token),token);
  assert.ok(recipe.generated.includes(build.assets.find(row=>row.role==="application").sha256));
  assert.equal(recipe.generated.includes("withPacketOrderProbe"),false);
});
test("cancelling after final copy cannot mask memory failure or accept a real return to encoding",()=>{
  const probe={workCheckpoints:[],lastProgressObservation:null,unavailableProgressSamples:0};
  const state={jobState:"running",selectedProfileId:"mkv-to-mp4",phase:"Copying staged MP4 to selected destination",
    metrics:{inputBytes:100,outputBytes:0,scratchBytes:1000,elapsedMs:100,wasmMemoryBytes:50331648,peakWasmMemoryBytes:50331648,
      maxWriteChunkBytes:65536,peakQueuedBytes:65536,peakPendingOperations:1}};
  recordHandoffStageProgress(probe,state);
  recordHandoffStageProgress(probe,{...state,phase:"Cancelling safely"});assert.equal(probe.copyCancellationObserved,true);
  assert.throws(()=>recordHandoffStageProgress(probe,{...state,phase:"Encoding media"}));
  recordHandoffStageProgress(probe,{...state,metrics:{...state.metrics,wasmMemoryBytes:0,outputBytes:10,elapsedMs:101}});
  assert.throws(()=>recordHandoffStageProgress(probe,{...state,metrics:{...state.metrics,peakWasmMemoryBytes:0}}));
  assert.equal(probe.finalDestinationCopyObservation.last.outputBytes,10);
});
test("actual qualified combined media feeds complete bounded original-source closure and owned supervisor",async()=>{
  process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT="evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
  process.env.WITHIN_COMPOSITED_HANDOFF_MEDIA="evidence/2026-10-15T17-20-01-310Z-composited-handoff-media.json";
  const caller=await makeEbmlFullCaller(root),snapshot=await captureLayeredFullSourcePins(root,caller.extraFiles);
  const previous=JSON.parse(await readFile(path.join(root,PREVIOUS_FULL)));
  for(const [file,hash]of Object.entries(previous.sourcePins))assert.equal(snapshot.pins[file],hash,file);
  assert.ok(snapshot.extensionFiles.length<=128);assert.ok(snapshot.supplementalRestoredBytes<=2097152);
  const runtime=await createOwnedRuntimeScratch("allocation-attempt-full-wrapper-");
  try {
    const driver=await makeEbmlFullDriver(root,runtime.directory,"allocation-attempt-media-HANDOFFUNIT",snapshot.files);
    const supervisor=await makeEbmlFullSupervisor(await readFile(path.join(root,"scripts/launch-packet-largest-idle-supervisor.mjs"),"utf8"),root);
    for(const source of [caller.generated,driver.generated,supervisor.generated]) {
      const syntax=spawnSync(process.execPath,["--check","--input-type=module"],{input:source,encoding:"utf8",windowsHide:true,timeout:5000});assert.equal(syntax.status,0,syntax.stderr);
    }
    assert.ok(caller.generated.includes("scripts/build-composited-handoff.mjs"));
    assert.ok(supervisor.generated.includes("reliable-owned-identity.mjs"));
    assert.ok(supervisor.generated.includes("noAutomaticRestart: true"));
    assert.equal(driver.codecIoQualityMemoryRepeatAndCleanupGatesChanged,false);
    assert.equal(driver.manifest.aggregateWasmMemoryBytes,50331648);
  }finally{await runtime.close();}
});
