import "../scripts/lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { gunzipSync } from "node:zlib";
import { THREAD_PARENT_FULL,makeThreadedSourceLayer,captureLayeredFullSourcePins } from "../scripts/lib/threaded-validation-full-sources.mjs";
import { patchThreadedValidationDriver,makeEbmlFullCaller,makeEbmlFullDriver,makeEbmlFullSupervisor } from "../scripts/lib/threaded-validation-full-recipe.mjs";
import { inspectThreadValidatorQualification,THREAD_VALIDATOR_PROOF } from "../scripts/lib/threaded-validator-qualification.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file),"utf8");
const syntax=source=>{const checked=spawnSync(process.execPath,["--check","--input-type=module"],{input:source,encoding:"utf8",windowsHide:true,timeout:5000});assert.equal(checked.status,0,checked.stderr);};
test("qualified actual source/fixture validator cannot accept changed pixels, timings, source identity or deadlines",async()=>{
  const record=JSON.parse(await read(THREAD_VALIDATOR_PROOF));assert.equal(inspectThreadValidatorQualification(record).threads,4);
  for(const mutate of [row=>{row.sourceResult.frames--;},row=>{row.control.pixelHashes[1].framemd5Sha256="bad";},
    row=>{row.control.timings[1].orderedTimestampSha256="bad";},row=>{row.launch.maximumMs*=2;},row=>{row.protectedAfter.sha256="bad";},
    row=>{row.sourceResult.maximumBytes*=2;}]){const changed=structuredClone(record);mutate(changed);assert.throws(()=>inspectThreadValidatorQualification(changed));}
});
test("full derivative changes only qualified source decode threads, bounded error metadata and additive source join",async()=>{
  const terminal=JSON.parse(await read(THREAD_PARENT_FULL)),archive=JSON.parse(gunzipSync(await readFile(path.join(root,terminal.sourceArchive.path))));
  const result=patchThreadedValidationDriver(archive.generated,["scripts/lib/threaded-validation-full-recipe.mjs"]);syntax(result.generated);
  let reversed=result.generated;for(const [before,after]of result.edits.toReversed())reversed=reversed.replace(after,before);assert.equal(reversed,archive.generated);
  for(const token of ["file===source?\"4\":\"1\"","30*60_000,maxBuffer:32*MiB","number <= 3","run.incrementalPrivateMiB <= 250",
    "minimumMs: 300000","maximumTimestampErrorSeconds <= 0.001","ssim >= 0.98","inputTimes.length, outputTimes.length",
    "assert.equal(metrics.peakWasmMemoryBytes, 48 * MiB)","originalFullSourceAcceptance","nativeValidation:error.nativeValidation??null"])
    assert.ok(result.generated.includes(token),token);
  const frameParser=source=>source.slice(source.indexOf('  return stdout.split(/'),source.indexOf('\n}\nasync function audioHashes'));
  assert.equal(frameParser(result.generated),frameParser(archive.generated));
});
test("new source layer retains every714 executed parent preimage and unchanged128-file/2MiB new cap",async()=>{
  const layer=makeThreadedSourceLayer(await read("scripts/lib/duration-drain-full-sources.mjs"),root);syntax(layer.generated);
  let reversed=layer.generated;for(const [before,after]of layer.edits.toReversed())reversed=reversed.replace(after,before);assert.equal(reversed,await read("scripts/lib/duration-drain-full-sources.mjs"));
  process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT="evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
  process.env.WITHIN_COMPOSITED_HANDOFF_MEDIA="evidence/2026-10-15T17-20-01-310Z-composited-handoff-media.json";
  const caller=await makeEbmlFullCaller(root),snapshot=await captureLayeredFullSourcePins(root,caller.extraFiles),previous=JSON.parse(await read(THREAD_PARENT_FULL));
  for(const [file,hash]of Object.entries(previous.sourcePins))assert.equal(snapshot.pins[file],hash,file);
  assert.ok(snapshot.extensionFiles.length>0&&snapshot.extensionFiles.length<=128);assert.ok(snapshot.supplementalRestoredBytes<=2097152);
  assert.equal(snapshot.limits.parentFiles,714);assert.equal(snapshot.limits.extensionFiles,128);
  const runtime=await createOwnedRuntimeScratch("allocation-attempt-full-wrapper-");
  try{
    const driver=await makeEbmlFullDriver(root,runtime.directory,"allocation-attempt-media-THREADUNIT",snapshot.files);
    const supervisor=await makeEbmlFullSupervisor(await read("scripts/launch-packet-largest-idle-supervisor.mjs"),root);
    for(const source of [caller.generated,driver.generated,supervisor.generated])syntax(source);
    assert.equal(driver.manifest.aggregateWasmMemoryBytes,50331648);assert.ok(supervisor.generated.includes("noAutomaticRestart: true"));
    assert.equal(driver.browserCodecIoQualityMemoryRepeatAndCleanupGatesChanged,false);
  }finally{await runtime.close();}
});
