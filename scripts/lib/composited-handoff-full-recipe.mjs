import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeEbmlFullCaller as parentCaller,makeEbmlFullDriver as parentDriver,makeEbmlFullSupervisor as parentSupervisor } from "./duration-drain-full-recipe.mjs";
import { loadQualifiedCompositedMedia } from "./composited-handoff-full-media.mjs";
export { createAttemptPlaneCandidate,verifyAttemptPlaneCandidate } from "./duration-drain-full-recipe.mjs";
export { loadQualifiedCompositedMedia as loadQualifiedEbmlMedia };
export const PREVIOUS_FULL="evidence/2026-10-15T11-18-16-969Z-duration-drain-original-full-terminal.json";
export const HANDOFF_FULL_FILES=["scripts/lib/composited-handoff-full-recipe.mjs","scripts/lib/composited-handoff-full-media.mjs",
  "scripts/lib/composited-handoff-full-sources.mjs","scripts/lib/handoff-stage-progress.mjs","scripts/run-composited-handoff-full.mjs","tests/composited-handoff-full.test.mjs"];
const oldAsset={url:"/assets/ConverterApp-BcOk2BNt.js",bytes:315645,sha256:"96141855483b530b003afd81206bd63ce1c2a86e7e56c2462275352a69e36a48"};
export function patchHandoffFullDriver(source,root,assets) {
  const uri=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const application=assets.find(row=>row.role==="application");assert.ok(application);
  const binding=({url,bytes,sha256})=>({url,bytes,sha256});
  const renamed=source.replaceAll("-private-mpeg2-duration-drain-full-native-100ms","-private-mpeg2-composited-handoff-full-native-100ms");
  const lifecycle=`  progressProbe.handoffWorkerEvents=[];
  progressProbe.handoffPhysicalReleaseProven=false;
  const handoffBindings=${JSON.stringify(assets.map(binding))};
  progressProbe.handoffWorkerBindings=handoffBindings.slice(1);
  page.on("worker",worker=>{
    const match=handoffBindings.slice(1).find(row=>new URL(worker.url()).pathname===row.url);
    if(!match)return;
    const role=match.url.includes("staged-save.worker")?"save":"codec";
    const record=event=>{assert.ok(progressProbe.handoffWorkerEvents.length<32);progressProbe.handoffWorkerEvents.push({role,event,url:worker.url(),observedAt:Date.now()});};
    record("created");worker.once("close",()=>record("closed"));
  });
`;
  return exactPatch(source,[[source,renamed],
    [JSON.stringify(oldAsset),JSON.stringify(binding(application))],
    [`import { recordStagedOutputWorkCheckpoint as recordOutputWorkCheckpoint } from ${JSON.stringify(uri("staged-output-work-checkpoints.mjs"))};`,
      `import { recordHandoffStageProgress as recordOutputWorkCheckpoint } from ${JSON.stringify(uri("handoff-stage-progress.mjs"))};`],
    [`import { queryProcessIdentity, observeOwnedProcessExit } from ${JSON.stringify(uri("owned-process-exit-observation.mjs"))};`,
      `import { observeOwnedProcessExit } from ${JSON.stringify(uri("owned-process-exit-observation.mjs"))};\nimport { queryReliableProcessIdentity as queryProcessIdentity } from ${JSON.stringify(uri("reliable-owned-identity.mjs"))};`],
    ['const workers=page.workers().filter(w=>w.url().startsWith(origin+"/assets/conversion.worker-"));',
      'const workers=page.workers().filter(w=>w.url().startsWith(origin+"/assets/conversion.worker-")||w.url().startsWith(origin+"/assets/staged-save.worker-"));'],
    ['  page.on("console", (message) => {',lifecycle+'  page.on("console", (message) => {'],
    ['    assert.equal(metrics.wasmMemoryBytes, 48 * MiB);','    assert.equal(metrics.wasmMemoryBytes, 0);\n    assert.equal(metrics.sharedArrayBufferBytes,4);'],
  ]);
}
export async function makeEbmlFullDriver(root,runtime,name,files) {
  const parent=await parentDriver(root,runtime,name,files),qualified=await loadQualifiedCompositedMedia(root);
  const patched=patchHandoffFullDriver(parent.generated,root,qualified.build.assets);
  return {...parent,...patched,qualifiedMedia:qualified.reference,workerLifecycleChanged:true,
    codecIoQualityMemoryRepeatAndCleanupGatesChanged:false,physicalReleaseBeforeCopyProven:false};
}
export async function makeEbmlFullCaller(root) {
  const parent=await parentCaller(root),qualified=await loadQualifiedCompositedMedia(root),old=JSON.parse(await readFile(path.join(root,PREVIOUS_FULL)));
  assert.equal(Object.keys(old.sourcePins).length,656);assert.deepEqual(old.sourcePins,old.postSourcePins);
  for(const [file,hash]of Object.entries(old.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),hash,file);
  const extra=[...new Set([...parent.extraFiles,...Object.keys(old.sourcePins),PREVIOUS_FULL,old.sourceArchive.path,
    ...Object.keys(qualified.allSourcePins),...qualified.additionalEvidence,...HANDOFF_FULL_FILES,
    qualified.reference.path,qualified.reference.independentSeal.path,qualified.supplementPath,qualified.proof.generatedArchive.path,
    qualified.proof.report.archive.path,qualified.supplement.archive.path])];
  const before=pathToFileURL(path.join(root,"scripts/lib/duration-drain-full-recipe.mjs")).href;
  const after=pathToFileURL(path.join(root,"scripts/lib/composited-handoff-full-recipe.mjs")).href;
  assert.equal(parent.generated.split(before).length-1,3);
  const renamed=parent.generated.replaceAll(before,after)
    .replaceAll("${stamp}-duration-drain-full-live","${stamp}-composited-handoff-full-live")
    .replaceAll("${stamp}-duration-drain-original-full","${stamp}-composited-handoff-original-full")
    .replaceAll("-private-mpeg2-duration-drain-full-native-100ms.json","-private-mpeg2-composited-handoff-full-native-100ms.json")
    .replaceAll("|duration-drain)-full-live","|duration-drain|composited-handoff)-full-live");
  const oldBuild=`    const buildPath = \`evidence/\${stamp}-progress-compositing-build.json\`;
    await exec(process.execPath, ["scripts/build-progress-compositing-candidate.mjs", stamp, "--for-browser"],
      { cwd: root, env: runtime.env, windowsHide: true, timeout: 180000, maxBuffer: 2097152 });
    const bytes = await read(buildPath), ui = JSON.parse(bytes); assert.deepEqual(ui.asset, base.archive.expectedAsset);
    assert.deepEqual(ui.stylesheet, { url: base.archive.stylesheet.url, bytes: base.archive.stylesheet.bytes, sha256: base.archive.stylesheet.sha256 });`;
  const newBuild=`    const buildPath = \`evidence/\${stamp}-composited-handoff-build.json\`;
    await exec(process.execPath,["scripts/build-composited-handoff.mjs",stamp,"--for-browser"],
      {cwd:root,env:runtime.env,windowsHide:true,timeout:180000,maxBuffer:2097152});
    const bytes=await read(buildPath),ui=JSON.parse(bytes);
    assert.equal(ui.progressCompositingPreserved,true);
    assert.deepEqual(ui.assets.map(({role,url,bytes,sha256})=>({role,url,bytes,sha256})),media.build.assets.map(({role,url,bytes,sha256})=>({role,url,bytes,sha256})));
    for(const key of ["url","bytes","sha256"])assert.equal(ui.stylesheet[key],media.build.stylesheet[key]);
    assert.equal(ui.nativeWasmChanged,false);assert.equal(ui.copyLoopChanged,false);`;
  return {...parent,...exactPatch(parent.generated,[[parent.generated,renamed],
    [pathToFileURL(path.join(root,"scripts/lib/duration-drain-full-sources.mjs")).href,pathToFileURL(path.join(root,"scripts/lib/composited-handoff-full-sources.mjs")).href],
    ['const callerFiles = [','const callerFiles = ['+extra.map(file=>JSON.stringify(file)).join(",")+','],[oldBuild,newBuild]]),
    extraFiles:extra,qualifiedBrowser:qualified.reference,workerLifecycleChanged:true,originalConversionAcceptanceGatesByteExact:false,
    codecFidelityMemoryAndRepeatGatesUnchanged:true};
}
export async function makeEbmlFullSupervisor(source,root) {
  const parent=await parentSupervisor(source,root),before="scripts/run-duration-drain-full.mjs",after="scripts/run-composited-handoff-full.mjs";
  assert.equal(parent.generated.split(before).length-1,3);
  const named=parent.generated.replaceAll(before,after).replaceAll("duration-drain-supervisor","composited-handoff-supervisor");
  const uri=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const patched=exactPatch(named,[[`import { queryProcessIdentity } from ${JSON.stringify(uri("owned-process-exit-observation.mjs"))};`,
    `import { queryReliableProcessIdentity as queryProcessIdentity } from ${JSON.stringify(uri("reliable-owned-identity.mjs"))};`],
    ['[own, "scripts/lib/bounded-supervisor-journal.mjs",','[own,"scripts/lib/reliable-owned-identity.mjs", "scripts/lib/bounded-supervisor-journal.mjs",'],
    ['DO NOT restart")), 30000)','DO NOT restart")), 120000)']]);
  return {...parent,...patched,publicAcceptance:false};
}
