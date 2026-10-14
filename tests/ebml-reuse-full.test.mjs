import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { loadQualifiedEbmlMedia,makeEbmlFullCaller,makeEbmlFullDriver,makeEbmlFullSupervisor } from "../scripts/lib/ebml-reuse-full-recipe.mjs";
import { captureLayeredFullSourcePins } from "../scripts/lib/ebml-reuse-full-sources.mjs";
import { validateCompositeAllocationFailureRecord } from "../scripts/lib/ebml-reuse-full-failure.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file),"utf8");
process.env.WITHIN_EBML_REUSE_CONTROL_RECEIPT="evidence/2026-10-14T18-11-48-138Z-ebml-reuse-browser-control-executed-sources.json";
function syntax(source){const result=spawnSync(process.execPath,["--check","--input-type=module"],{input:source,encoding:"utf8",windowsHide:true,timeout:5000});assert.equal(result.status,0,result.stderr);}
test("actual273-source media/control prerequisites bind full caller to new native policy without weakening original gates",async()=>{
  const qualified=await loadQualifiedEbmlMedia(root);assert.equal(qualified.reference.sourceCount,273);
  assert.equal(qualified.report.manifest.artifacts["within-mpeg2-split.wasm"],"7037563225465b6bff6f3f17eccc9a2f42033e435d3473101efb631b6736fe25");
  const caller=await makeEbmlFullCaller(root);syntax(caller.generated);
  for(const token of ["raw.requestedRuns, 3","raw.limitMiB, 250","raw.progressProbe.maximumConversionMs, 21600000",
    "raw.progressProbe.partialOutputStopEnabled, false","2958573265","31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34",
    "raw.forbiddenRequests, []","ebml-reuse-full-recipe.mjs","ebml-reuse-full-sources.mjs","ebml-reuse-full-failure.mjs"])
    assert.ok(caller.generated.includes(token),token);
  const snapshot=await captureLayeredFullSourcePins(root,caller.extraFiles);
  assert.equal(snapshot.parent.sourceCount,508);assert.ok(snapshot.extensionFiles.length<=128);assert.equal(snapshot.omittedLegacyFiles,0);
  assert.ok(snapshot.supplementalRestoredBytes<=2097152);assert.ok(snapshot.files.length>508);
});
test("full driver and same-entry hidden supervisor parse with new adapter identity, original conversion/measurement code and owned cleanup",async()=>{
  const runtime=await createOwnedRuntimeScratch("allocation-attempt-full-wrapper-");
  try {
    const caller=await makeEbmlFullCaller(root),snapshot=await captureLayeredFullSourcePins(root,caller.extraFiles);
    const driver=await makeEbmlFullDriver(root,runtime.directory,"allocation-attempt-media-EBMLUnit",snapshot.files);syntax(driver.generated);
    const supervisor=makeEbmlFullSupervisor(await read("scripts/launch-packet-largest-idle-supervisor.mjs"),root);syntax(supervisor.generated);
    assert.ok(driver.generated.includes("scripts/stage-ebml-reuse-full.mjs"));assert.ok(driver.generated.includes(driver.adapter.sha256));
    assert.equal(driver.codecIoQualityMemoryRepeatAndCleanupGatesChanged,false);
    assert.ok(supervisor.generated.includes("scripts/run-ebml-reuse-full.mjs"));assert.ok(supervisor.generated.includes("windowsHide: true"));
  }finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
});
test("new offline failure validator accepts actual new captured control and refuses old decoder identity without fake heap",async()=>{
  const control=JSON.parse(await read("evidence/2026-10-14T18-11-48-138Z-ebml-reuse-browser-control.json"));
  const row=control.result.terminal.emitted;validateCompositeAllocationFailureRecord(row);
  assert.throws(()=>validateCompositeAllocationFailureRecord({...row,qualifiedBinarySha256:"eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c"}));
});
