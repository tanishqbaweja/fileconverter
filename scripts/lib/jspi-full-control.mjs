import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { deriveRecordedTimelineDriver, deriveRecordedTimelineSupervisor } from "./recorded-timeline-full-recipe.mjs";
import { deriveJspiBrowserDriver, deriveJspiBrowserCaller } from "./jspi-browser-control.mjs";

export const JSPI_FULL_FILES = ["scripts/lib/jspi-full-control.mjs", "scripts/lib/jspi-full-qualification.mjs",
  "scripts/lib/jspi-full-journal.mjs", "scripts/run-jspi-full.mjs", "tests/jspi-full-control.test.mjs",
  "scripts/inspect-jspi-full-preparation.mjs"];
export function extractOriginalFullLoop(source) {
  const start = source.indexOf("  for (let number = 1; number <= 3; number++) {"), end = source.indexOf("\n  assert.deepEqual(forbiddenRequests, []);", start);
  assert.ok(start > 0 && end > start); return source.slice(start, end);
}
export function deriveJspiFullLoop(source) {
  const original = extractOriginalFullLoop(source);
  const start = original.indexOf("    assert.equal(asyncifyStorageFinalSamples.length, number);");
  const end = original.indexOf("    assert.equal(splitFinalSamples.length, number);", start);
  assert.ok(start > 0 && end > start);
  const lifecycle = `    assert.equal(jspiLifecycleFinalSamples.length, number);
    const suspension = jspiLifecycleFinalSamples[number - 1];
    validateJspiLifecycle(suspension);assert.equal(suspension.failedCalls,0);
    run.jspiLifecycle = suspension;
`;
  return exactPatch(original, [
    [original.slice(start, end), lifecycle],
    ['        nextLog = Date.now() + 30_000;', '        await fullRunJournal.progress(number,lastState,run.incrementalPrivateMiB);\n        nextLog = Date.now() + 30_000;'],
    ['    run.recovery = await stable(`cleanup-${number}`, loadedIdle.privateBytes + 96 * MiB);',
      '    run.recovery = await stable(`cleanup-${number}`, loadedIdle.privateBytes + 96 * MiB);\n    await fullRunJournal.validated(run,blankBaseline,loadedIdle);'],
    ['    assert.equal(nativeStackSamples[number - 1].encoderNativeStackBytes, 262144);',
      '    assert.equal(nativeStackSamples[number - 1].encoderNativeStackBytes, 262144);\n    assert.equal(nativeStackSamples[number - 1].asyncifyStackBytes,0);\n    assert.equal(nativeStackSamples[number - 1].suspensionMode,"jspi");\n    assert.equal(nativeStackSamples[number - 1].engineManagedStackBytes,null);'],
  ]);
}
export async function deriveJspiFullDriver(...args) {
  const root = args[1], uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const small = await deriveJspiBrowserDriver(...args);
  const original = deriveRecordedTimelineDriver(...args.slice(0, 5)).generated, loop = deriveJspiFullLoop(original);
  const start = small.generated.indexOf('  observer.setPhase("conversion-completed-save-control");');
  const end = small.generated.indexOf('  assert.equal(progressProbe.compiledCacheEvents.filter', start);
  assert.ok(start > 0 && end > start);
  const scope = small.generated.match(/scope: "Six fully independently validated[^\r\n]+/)[0];
  const recipe = exactPatch(small.generated, [
    [`import {prepareJspiBrowserControl as prepareCompletedSaveControl} from ${JSON.stringify(uri("jspi-browser-control.mjs"))};\nlet completedSaveControl=null;`,
      `import {validateJspiLifecycle} from ${JSON.stringify(uri("jspi-browser-control.mjs"))};\nimport {loadJspiFullQualification} from ${JSON.stringify(uri("jspi-full-qualification.mjs"))};\nimport {createJspiFullJournal} from ${JSON.stringify(uri("jspi-full-journal.mjs"))};`],
    ['const diagnosticOnly = true;', 'const diagnosticOnly = false;'],
    ['  completedSaveControl=await prepareCompletedSaveControl(root,reportBase);', '  // Small controls already qualified; no fixture recreation in the full-file run.'],
    ['  await attempt(async()=>{if(completedSaveControl)cleanup.completedSaveFixture=await completedSaveControl.close();});',
      '  // No additional small fixture exists in this full-file session.'],
    [small.generated.slice(start, end), loop.generated + '\n  assert.equal(workerEventRecorder.summary().firstError,null,"Owned worker records valid");\n'],
    ['row.event==="reused").length,16', 'row.event==="reused").length,4'],
    ['assert.equal(diagnosticOnly,true);assert.equal(runs.length,0);',
      'assert.equal(diagnosticOnly,false);assert.equal(runs.length,3);assert.equal(fullRunJournal.records.length,3);\n  assert.ok(runs.every(run=>run.independentValidation&&run.recovery));'],
    ['"six-small-jspi-outputs-and-adverse-recovery-not-full-acceptance"', '"three-full-jspi-original-runs-completed-not-public-acceptance"'],
    ['"failed-jspi-browser-qualification"', '"failed-jspi-full-qualification"'],
    [scope, 'scope: "Three full unchanged protected-original JSPI HEVC to MPEG2 conversions; exact qualified assets/plane encoder. Original six-hour per-run deadline, all content/timestamp/SSIM>=.98/metadata/AVIO/cleanup/lower-blank/full-tree250MiB gates retained. Prior six-small-output/adverse qualification reused, not rerun. No scaling, paired speed or public acceptance.",'],
    ['requestedStartupControls:0, requestedCompletedConversions:0, requestedSmallCompletedConversions:6, requestedRuns:0,',
      'requestedStartupControls:0, requestedCompletedConversions:3, requestedSmallCompletedConversions:0, requestedRuns:3,'],
    ['const launchJournal=await createFullLaunchJournal',
      'const fullQualification=await loadJspiFullQualification(root);\nprogressProbe.jspiFullQualification=fullQualification.reference;\nconst fullRunJournal=createJspiFullJournal(root,reportBase,fullQualification.reference,sourceHashes);\nprogressProbe.jspiFullValidatedRuns=fullRunJournal.records;\nconst launchJournal=await createFullLaunchJournal'],
  ]);
  return { ...recipe, fullLoopDerivation: loop, originalContentValidatorsChanged: false, publicAcceptance: false };
}
export function deriveJspiFullSupervisor(source, root) {
  const parent = deriveRecordedTimelineSupervisor(source, root);
  return exactPatch(parent.generated, [[parent.generated, parent.generated
    .replaceAll("scripts/run-recorded-timeline-full.mjs", "scripts/run-jspi-full.mjs")
    .replaceAll("recorded-timeline-supervisor", "jspi-full-supervisor")]]);
}
export async function deriveJspiFullCaller(source, root) {
  const parent = await deriveJspiBrowserCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const generated = parent.generated.replaceAll('${stamp}-jspi-control-', '${stamp}-jspi-full-')
    .replace('|jspi-control|paint-boundary-control', '|jspi-control|jspi-full|paint-boundary-control');
  return exactPatch(generated, [
    [`import {deriveJspiBrowserDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("jspi-browser-control.mjs"))};`,
      `import {deriveJspiFullDriver as deriveUpdatedChromeFullDriver,deriveJspiFullSupervisor as deriveUpdatedChromeSupervisor} from ${JSON.stringify(uri("jspi-full-control.mjs"))};\nimport {loadJspiFullQualification,assertJspiFullBuild} from ${JSON.stringify(uri("jspi-full-qualification.mjs"))};`],
    [`import {deriveRecordedTimelineSupervisor as deriveUpdatedChromeSupervisor} from ${JSON.stringify(uri("recorded-timeline-full-recipe.mjs"))};`, '// JSPI full supervisor imported with the full driver.'],
    ['  const ownFiles=[', `  const fullQualification=await loadJspiFullQualification(root);\n  const ownFiles=[...fullQualification.files,${JSPI_FULL_FILES.map(JSON.stringify).join(",")},`],
    ['    sourceTimelineReference:timeline.referenceBinding,', '    jspiFullQualification:fullQualification.reference,sourceTimelineReference:timeline.referenceBinding,'],
    ['      receipt.build={path:buildPath,sha256:sha(buildBytes)};', '      assertJspiFullBuild(build,fullQualification.build);\n      receipt.build={path:buildPath,sha256:sha(buildBytes)};'],
    ['assert.equal(row.status,"six-small-jspi-outputs-and-adverse-recovery-not-full-acceptance");assert.equal(row.progressProbe.successfulSaveControl.successfulFixtureValidations,6);assert.equal(row.runs.length,0);',
      'assert.equal(row.status,"three-full-jspi-original-runs-completed-not-public-acceptance");assert.equal(row.runs.length,3);assert.equal(row.progressProbe.jspiFullValidatedRuns.length,3);assert.ok(row.runs.every(run=>run.independentValidation&&run.recovery));'],
    ['"jspi-small-output-controls-finished-pending-audit-not-acceptance"', '"jspi-three-full-original-runs-finished-pending-audit-not-public-acceptance"'],
    ['requestedStartupControls:3,requestedCompletedConversions:0,requestedRuns:3,', 'requestedStartupControls:0,requestedCompletedConversions:3,requestedRuns:3,'],
  ]);
}
