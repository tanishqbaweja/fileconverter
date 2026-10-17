import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { deriveOriginalStartupCaller, deriveOriginalStartupDriver } from "./original-startup-control.mjs";

export function deriveSaveHandoffDriver(source, root, wrapper, candidateName, files) {
  const parent = deriveOriginalStartupDriver(source, root, wrapper, candidateName, files);
  const uri = pathToFileURL(path.join(root, "scripts/lib/completed-save-control.mjs")).href;
  const control = `  observer.setPhase("conversion-completed-save-control");
  let completedSaveSampling=true;
  const completedSaveSampler=(async()=>{while(completedSaveSampling){await takeSample("conversion-completed-save-control");await delay(1000);}})();
  void completedSaveSampler.catch(()=>{});
  try{await completedSaveControl.run(page);}
  finally{completedSaveSampling=false;try{await completedSaveSampler;}finally{progressProbe.successfulSaveControl=completedSaveControl.report();}}
  await observer.through(Date.now());
  const savedPeak=observer.peaks(["conversion-completed-save-control"]);
  assert.ok(savedPeak.peak);assert.ok((savedPeak.peak.privateBytes-blankBaseline.privateBytes)/MiB<=250,"Completed fixture whole-tree250MiB limit unchanged");
  progressProbe.successfulSaveNativePeaks=savedPeak;
  assert.equal(progressProbe.successfulSaveControl.successfulFixtureValidations,1);
  await page.waitForFunction(()=>window.__WITHIN_TEST__?.getState().workerStatus==="ready");
  progressProbe.afterSuccessfulSaveIdle=await stable("post-successful-save-idle",loadedIdle.privateBytes+96*MiB);
`;
  const scope = parent.generated.match(/scope: "Bounded ORIGINAL-file startup diagnostic[^\r\n]+/)[0];
  return exactPatch(parent.generated, [
    ['const diagnosticOnly = true;', `import {prepareCompletedSaveControl} from ${JSON.stringify(uri)};\nlet completedSaveControl=null;\nconst diagnosticOnly = true;`],
    ['  runtime = await createOwnedRuntimeScratch("allocation-attempt-full-runtime-");',
      '  runtime = await createOwnedRuntimeScratch("allocation-attempt-full-runtime-");\n  completedSaveControl=await prepareCompletedSaveControl(root,reportBase);'],
    ['  loadedIdle = await stable("loaded-idle");', '  loadedIdle = await stable("loaded-idle");\n' + control],
    ['  await attempt(() => browser?.close());',
      '  await attempt(() => browser?.close());\n  await attempt(async()=>{if(completedSaveControl)cleanup.completedSaveFixture=await completedSaveControl.close();});'],
    [scope, 'scope: "One complete independently validated small fixture and successful final-save handoff under actual full browser launcher, followed by three bounded unchanged ORIGINAL startup/cancellation controls. Same five-minute lower blank/all-tree250MiB/production engines and I/O. No completed/independently full-validated original conversion; no public, speed or full-profile acceptance.",'],
  ]);
}

export function deriveSaveHandoffCaller(source, root) {
  const parent = deriveOriginalStartupCaller(source, root);
  const uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const result = exactPatch(parent.generated, [
    [`import {deriveOriginalStartupDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("original-startup-control.mjs"))};`,
      `import {deriveSaveHandoffDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("save-handoff-control.mjs"))};`],
    ['  const ownFiles=[', '  const ownFiles=["scripts/diagnose-save-handoff.mjs","scripts/lib/save-handoff-control.mjs","scripts/lib/completed-save-control.mjs","tests/save-handoff-control.test.mjs",'],
    ['assert.equal(row.status,"three-original-startup-cancellations-observed-not-acceptance");',
      'assert.equal(row.status,"three-original-startup-cancellations-observed-not-acceptance");assert.equal(row.progressProbe.successfulSaveControl.successfulFixtureValidations,1);'],
  ]);
  const generated = result.generated.replaceAll('${stamp}-original-startup-', '${stamp}-save-handoff-control-')
    .replace('/(?:recorded-timeline-full|original-startup)-(?:live|terminal)',
      '/(?:recorded-timeline-full|original-startup|original-idle|save-handoff-control)-(?:live|terminal)');
  assert.ok(generated.includes('${stamp}-save-handoff-control-live.json'));
  return { generated, publicAcceptance: false, fullOriginalAcceptance: false };
}
