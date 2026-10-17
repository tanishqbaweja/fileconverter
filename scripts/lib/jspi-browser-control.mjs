import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { prepareJournaledJspiControl } from "./jspi-validated-control-journal.mjs";
import { deriveCatalogueSlotDriver, deriveCatalogueSlotCaller } from "./catalogue-slot-control.mjs";
import { loadJspiBrowserNative, JSPI_NATIVE_PROOF } from "./jspi-browser-native.mjs";
import { loadJspiBrowserAdapter } from "./jspi-browser-adapter.mjs";
const ownFiles = ["scripts/lib/jspi-browser-native.mjs", "scripts/lib/jspi-browser-adapter.mjs", "scripts/lib/jspi-browser-control.mjs",
  "scripts/lib/jspi-full-failure.mjs", "scripts/qualify-jspi-browser.mjs", "scripts/retain-jspi-native-sources.mjs", "tests/jspi-browser-control.test.mjs"];
ownFiles.push("scripts/lib/bounded-worker-event-recorder.mjs", "scripts/lib/jspi-validated-control-journal.mjs", "tests/bounded-worker-event-recorder.test.mjs");
export function validateJspiLifecycle(sample) {
  assert.equal(sample.mode, "jspi"); assert.equal(sample.calls, 1); assert.equal(sample.activeCalls, 0); assert.equal(sample.maximumActiveCalls, 1);
  assert.ok([0, 1].includes(sample.failedCalls)); assert.equal(sample.asyncifyLinearStackBytes, 0);
  assert.equal(sample.engineManagedStackMemoryBytes, null); assert.equal(sample.engineManagedStackIncludedInProcessTreeMeasurement, true);
}
export async function prepareJspiBrowserControl(root, reportBase) {
  // The six outputs, fixtures, byte/timing/SSIM/metadata validators and all adverse
  // controls are literally the original module, not a rewritten weaker suite.
  const parent = await prepareJournaledJspiControl(root, reportBase), samples = [], stacks = [];
  const report = () => ({ ...parent.report(), jspiLifecycle: { samples: [...samples], stacks: [...stacks],
    maximumRecords: 16, linearAsyncifyStorageNotUsed: true, engineManagedStackMemoryBytes: null,
    allNativeAndContentValidatorsUnchanged: true, acceptanceMetric: false } });
  return { ...parent, report, async run(page) {
    const capture = message => {
      const text = message.text();
      for (const [prefix, rows] of [["WITHIN_JSPI_LIFECYCLE_FINAL ", samples], ["WITHIN_MPEG2_STACK_RESERVE ", stacks]]) {
        if (!text.startsWith(prefix)) continue;
        assert.ok(text.length <= 2048 && rows.length < 16); rows.push(JSON.parse(text.slice(prefix.length)));
      }
    };
    page.on("console", capture);
    try {
      await parent.run(page); assert.equal(parent.report().successfulFixtureValidations, 6);
      assert.ok(samples.length >= 6 && stacks.length >= 6);
      for (const sample of samples) validateJspiLifecycle(sample);
      for (const sample of stacks) {
        assert.equal(sample.nativeStackBytes, 262144); assert.equal(sample.encoderNativeStackBytes, 262144); assert.equal(sample.stackOverflowCheck, 2);
        assert.equal(sample.decoderMemoryBytes, 33554432); assert.equal(sample.encoderMemoryBytes, 16777216); assert.equal(sample.aggregateWasmMemoryBytes, 50331648);
        assert.equal(sample.asyncifyStackBytes, 0); assert.equal(sample.suspensionMode, "jspi"); assert.equal(sample.engineManagedStackBytes, null);
      }
      return report();
    } finally { page.off("console", capture); }
  } };
}
export async function deriveJspiBrowserDriver(...args) {
  const parent = deriveCatalogueSlotDriver(...args), root = args[1], uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const adapter = await loadJspiBrowserAdapter(root), oldHash = sha(adapter.original), newHash = sha(adapter.recipe.generated);
  const oldBytes = Buffer.byteLength(adapter.original), newBytes = Buffer.byteLength(adapter.recipe.generated);
  let generated = exactPatch(parent.generated, [
    ['  progressProbe.handoffWorkerEvents=[];', `  const {createBoundedWorkerEventRecorder}=await import(${JSON.stringify(uri("bounded-worker-event-recorder.mjs"))});\n  const workerEventRecorder=createBoundedWorkerEventRecorder();progressProbe.handoffWorkerEvents=workerEventRecorder.events;progressProbe.handoffWorkerEventSummary=workerEventRecorder.summary();`],
    ['    const record=event=>{assert.ok(progressProbe.handoffWorkerEvents.length<32);progressProbe.handoffWorkerEvents.push({role,event,url:worker.url(),observedAt:Date.now()});};',
      '    const record=event=>{workerEventRecorder.record({role,event,url:worker.url(),observedAt:Date.now()});progressProbe.handoffWorkerEventSummary=workerEventRecorder.summary();};'],
    ['  try{await completedSaveControl.run(page);}', '  try{await completedSaveControl.run(page);assert.equal(workerEventRecorder.summary().firstError,null,"Owned worker diagnostic records must be valid");}'],
    [`import { verifyAttemptPlaneCandidate } from ${JSON.stringify(uri("duration-drain-full-recipe.mjs"))};`,
      `import { verifyJspiBrowserCandidate as verifyAttemptPlaneCandidate } from ${JSON.stringify(uri("jspi-browser-native.mjs"))};`],
    [uri("duration-drain-full-failure.mjs"), uri("jspi-full-failure.mjs")],
    [`import {prepareWarmCacheControl as prepareCompletedSaveControl} from ${JSON.stringify(uri("warm-cache-qualification.mjs"))};`,
      `import {prepareJspiBrowserControl as prepareCompletedSaveControl} from ${JSON.stringify(uri("jspi-browser-control.mjs"))};`],
    [`assert.equal((await stat(file)).size,${oldBytes});`, `assert.equal((await stat(file)).size,${newBytes});`],
    [`assert.equal(await shaFile(file),${JSON.stringify(oldHash)},`, `assert.equal(await shaFile(file),${JSON.stringify(newHash)},`],
    [`bytes:${oldBytes},sha256:${JSON.stringify(oldHash)}`, `bytes:${newBytes},sha256:${JSON.stringify(newHash)}`],
    ['"six-small-warm-cache-outputs-and-adverse-recovery-not-full-acceptance"', '"six-small-jspi-outputs-and-adverse-recovery-not-full-acceptance"'],
    ['"failed-original-startup-diagnostic"', '"failed-jspi-browser-qualification"'],
    [parent.generated.match(/scope: "Six fully independently validated[^\r\n]+/)[0],
      'scope: "Six fully independently validated production-browser outputs and all three adverse recoveries using JSPI decoder with exact qualified plane encoder, unchanged quality/AVIO/UI/lower blank/all-process250MiB guard. No full original/scaling/speed/public acceptance from small fixtures.",'],
  ]).generated;
  generated = generated.replaceAll("asyncifyStorageFinalSamples", "jspiLifecycleFinalSamples").replaceAll("WITHIN_ASYNCIFY_STORAGE_FINAL ", "WITHIN_JSPI_LIFECYCLE_FINAL ");
  return { generated, adapterRecipe: adapter.recipe, allContentAndAdverseValidationGatesUnchanged: true, publicAcceptance: false, fullOriginalAcceptance: false };
}
export async function deriveJspiBrowserCaller(source, root) {
  const parent = deriveCatalogueSlotCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const native = await loadJspiBrowserNative(root);
  const files = [...new Set([...ownFiles, ...Object.keys(native.build.manifest.sources), JSPI_NATIVE_PROOF,
    native.proof.proof.path, native.proof.branch.path, ...native.proof.layers.map(layer => layer.archive.path)])];
  const recipe = exactPatch(parent.generated, [
    [`import {loadUpdatedChromeQualification,copyUpdatedChromeCandidate} from ${JSON.stringify(uri("updated-chrome-qualification.mjs"))};`,
      `import {loadUpdatedChromeQualification} from ${JSON.stringify(uri("updated-chrome-qualification.mjs"))};\nimport {copyJspiBrowserCandidate as copyUpdatedChromeCandidate} from ${JSON.stringify(uri("jspi-browser-native.mjs"))};`],
    [`import {deriveUpdatedChromeFullStager,deriveRecordedTimelineSupervisor as deriveUpdatedChromeSupervisor} from ${JSON.stringify(uri("recorded-timeline-full-recipe.mjs"))};`,
      `import {deriveRecordedTimelineSupervisor as deriveUpdatedChromeSupervisor} from ${JSON.stringify(uri("recorded-timeline-full-recipe.mjs"))};\nimport {deriveJspiBrowserStager as deriveUpdatedChromeFullStager} from ${JSON.stringify(uri("jspi-browser-adapter.mjs"))};`],
    [`import {deriveCatalogueSlotDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("catalogue-slot-control.mjs"))};`,
      `import {deriveJspiBrowserDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("jspi-browser-control.mjs"))};`],
    ['  const ownFiles=[', `  const ownFiles=[${files.map(file => JSON.stringify(file)).join(",")},`],
    ['const recipe=deriveUpdatedChromeFullDriver(', 'const recipe=await deriveUpdatedChromeFullDriver('],
    ['const stager=deriveUpdatedChromeFullStager(', 'const stager=await deriveUpdatedChromeFullStager('],
    ['assert.equal(row.status,"six-small-warm-cache-outputs-and-adverse-recovery-not-full-acceptance");',
      'assert.equal(row.status,"six-small-jspi-outputs-and-adverse-recovery-not-full-acceptance");'],
    ['"warm-cache-small-output-controls-finished-pending-audit-not-acceptance"', '"jspi-small-output-controls-finished-pending-audit-not-acceptance"'],
  ]);
  return { generated: recipe.generated.replaceAll('${stamp}-catalogue-slot-control-', '${stamp}-jspi-control-')
    .replace('|catalogue-slot-control|paint-boundary-control', '|catalogue-slot-control|jspi-control|paint-boundary-control'), publicAcceptance: false, fullOriginalAcceptance: false };
}
