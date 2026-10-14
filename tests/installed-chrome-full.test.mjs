import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeReallocFullCaller,makeReallocFullDriver } from "../scripts/lib/realloc-full-recipe.mjs";
import { loadInstalledChromeFullQualification,makeInstalledChromeFullCaller,makeInstalledChromeFullDriver,makeInstalledChromeFullSupervisor } from "../scripts/lib/installed-chrome-full-recipe.mjs";
import { captureLayeredFullSourcePins,SUPPLEMENTAL_LIMITS } from "../scripts/lib/installed-chrome-full-sources.mjs";
const root=path.resolve(import.meta.dirname,".."),reverse=recipe=>{let value=recipe.generated;for(const [before,after] of recipe.installedChromeFullEdits.toReversed())value=value.replaceAll(after,before);return value;};
function syntax(source){const result=spawnSync(process.execPath,["--check","--input-type=module"],{input:source,encoding:"utf8",windowsHide:true,timeout:5000});assert.equal(result.status,0,result.stderr);}
test("qualified actual155 control/media pin replaces old154 only via before/after/runtime gates; old pipeline and original acceptance exactly retained",async()=>{
  const original=await makeReallocFullCaller(root),next=await makeInstalledChromeFullCaller(root),qualified=await loadInstalledChromeFullQualification(root);
  assert.equal(reverse(next),original.generated);syntax(next.generated);assert.equal(qualified.pin.version,"155.0.8059.40");assert.equal(qualified.reference.unchangedNativeProductionAdapter,true);
  for(const token of ["requestedRuns: 3","primaryLimitMiB: 250","nativeBitRate: 4000000","21600000","32 * 1024 ** 3","protectedSource()","finishOwnedCleanup(actions)","raw.forbiddenRequests, []","browserPinAfter=await inspectInstalledChromePin()","browserQualification.pin.library.sha256"])
    assert.ok(next.generated.includes(token),token);
  assert.ok(!next.generated.includes('), oldRaw.progressProbe.chromeLauncherSha256);'));assert.equal(next.conversionAcceptanceGatesChanged,false);
});
test("ALL493 preparation +255 qualification fit exact380+128/2MiB envelope; full driver conversion bytes unchanged apart from report namespace",async()=>{
  const qualified=await loadInstalledChromeFullQualification(root),caller=await makeInstalledChromeFullCaller(root),files=[...new Set([...caller.extraFiles,...Object.keys(qualified.media.sourcePins),qualified.media.generatedArchive.path,qualified.media.report.archive.path])];
  const snapshot=await captureLayeredFullSourcePins(root,files);assert.ok(snapshot.supplementalFiles.length<=128);assert.ok(snapshot.supplementalRestoredBytes<=2097152);assert.equal(SUPPLEMENTAL_LIMITS.legacyFiles,380);
  const prior=JSON.parse(await readFile(path.join(root,"evidence/2026-10-14T09-36-15-026Z-realloc-original-full-preparation.json")));for(const file of Object.keys(prior.sourcePins))assert.ok(snapshot.pins[file],file);
  const runtime=await createOwnedRuntimeScratch("allocation-attempt-full-wrapper-");
  try {const parent=await makeReallocFullDriver(root,runtime.directory,"allocation-attempt-media-UNIT123",snapshot.files),next=await makeInstalledChromeFullDriver(root,runtime.directory,"allocation-attempt-media-UNIT123",snapshot.files);
    assert.equal(reverse(next),parent.generated);syntax(next.generated);assert.equal(next.conversionAcceptanceGatesChanged,false);
    console.log(JSON.stringify({sources:snapshot.files.length,supplementalFiles:snapshot.supplementalFiles.length,supplementalRestoredBytes:snapshot.supplementalRestoredBytes}));
  }finally{await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});}
});
test("same-entry hidden supervisor retains real birth ownership/bounded journal/no automatic restart/finally",async()=>{
  const recipe=makeInstalledChromeFullSupervisor(await readFile(path.join(root,"scripts/launch-packet-largest-idle-supervisor.mjs"),"utf8"),root);syntax(recipe.generated);
  for(const token of ["windowsHide: true","detached: true","heartbeatSeconds: 60","runtime.close()","noAutomaticRestart: true","scripts/run-installed-chrome-realloc-full.mjs"])
    assert.ok(recipe.generated.includes(token),token);
});
