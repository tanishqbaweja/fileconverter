import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { transform, version as esbuildVersion } from "esbuild";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { deriveWarmCacheModule, deriveWarmCacheDriver, deriveWarmCacheCaller } from "./warm-cache-qualification.mjs";
const files = ["scripts/lib/lifecycle-allocation-attribution.mjs", "scripts/lib/lifecycle-warm-cache.mjs", "scripts/diagnose-lifecycle-warm-cache.mjs",
  "tests/lifecycle-allocation-attribution.test.mjs", "tests/lifecycle-warm-cache.test.mjs"];
export function deriveLifecycleWarmModule(spec, root) {
  const parent = deriveWarmCacheModule(spec, root);
  return exactPatch(parent.generated, [
    ['let afterValidated=()=>{};', 'let lifecycleCapture:(phase:string)=>Promise<unknown>=async(_phase:string)=>{};\nexport function setLifecycleCheckpoint(handler:(phase:string)=>Promise<unknown>){lifecycleCapture=handler;}\nlet afterValidated=()=>{};'],
    ['await validateConversionOnce(page,adapter,reload);afterValidated();', 'await validateConversionOnce(page,adapter,reload);await afterValidated();'],
    ['let validated=0;afterValidated=()=>{validated++;};', 'let validated=0;afterValidated=async()=>{validated++;await lifecycleCapture("validated-output-"+validated);};'],
    ['await recoverOnSamePage(page, originalWorker, "write-failure");', 'await lifecycleCapture("post-write-error-before-recovery");\n  await recoverOnSamePage(page, originalWorker, "write-failure");'],
    ['[exerciseWriteFailure,exerciseCancellation,exerciseReadFailure]', '[exerciseWriteFailure]'],
    ['expect(validated).toBe(6)', 'expect(validated).toBe(4)'],
    ['three-complete-small-outputs-then-write-cancel-read-faults-with-complete-same-page-recovery', 'diagnostic-prefix-three-small-outputs-write-failure-and-one-recovery-with-lifecycle-dumps'],
  ]);
}
export async function prepareLifecycleWarmControl(root, reportBase) {
  assert.equal(path.resolve(root), path.resolve(import.meta.dirname, "../.."));
  assert.equal(path.dirname(reportBase), path.join(root, "outputs/reports"));
  const receipt = JSON.parse(await readFile(path.join(root, "evidence/2026-10-16T16-41-46-137Z-updated-chrome-media.json")));
  const zip = await readFile(path.join(root, receipt.sourceArchive.path)); assert.equal(sha(zip), receipt.sourceArchive.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: 2097152 }); assert.equal(sha(raw), receipt.sourceArchive.restoredSha256);
  const spec = JSON.parse(raw).recipe.generated.spec, recipe = deriveLifecycleWarmModule(spec, root);
  const javascript = (await transform(recipe.generated, { loader: "ts", format: "esm", target: "es2022" })).code;
  const archived = gzipSync(Buffer.from(javascript), { level: 9 }), archivePath = reportBase + "-lifecycle-module.mjs.gz";
  await writeFile(archivePath, archived, { flag: "wx" });
  const provenance = { qualifiedSpecSha256: sha(spec), generatedTypescriptSha256: sha(recipe.generated), generatedJavascriptSha256: sha(javascript), esbuildVersion,
    validationAssertionsChanged: false, observationChanges: recipe.edits, prefixOfFailedWarmSequence: true,
    requestedSmallOutputs: 4, perturbsMemory: true, acceptanceMetric: false,
    archive: { path: path.relative(root, archivePath).replaceAll(path.sep, "/"), bytes: archived.length, sha256: sha(archived), restoredBytes: Buffer.byteLength(javascript), restoredSha256: sha(javascript) } };
  const generatedControl = await import("data:text/javascript;base64," + Buffer.from(javascript).toString("base64"));
  const control = await generatedControl.prepareCompletedSaveControl();
  return { ...control, setCheckpoint: generatedControl.setLifecycleCheckpoint, report: () => ({ ...control.report(), provenance }) };
}
export function deriveLifecycleWarmDriver(...args) {
  const parent = deriveWarmCacheDriver(...args), root = args[1], uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const start = `  lifecycleAttribution=createLifecycleAttribution({root,reportBase,createSession:()=>browser.newBrowserCDPSession(),
    getProcesses:async()=>{await observer.through(Date.now());return (await sampleChromiumTree(chrome.pid)).processes;},
    getRealms:()=>realms.sample(),getState:()=>page.evaluate(()=>window.__WITHIN_TEST__?.getState()??null)});
  completedSaveControl.setCheckpoint(phase=>lifecycleAttribution.capture(phase));
  await lifecycleAttribution.capture("loaded-before-media");
`;
  const scope = parent.generated.match(/scope: "Six fully independently validated[^\r\n]+/)[0];
  return exactPatch(parent.generated, [
    [`import {prepareWarmCacheControl as prepareCompletedSaveControl} from ${JSON.stringify(uri("warm-cache-qualification.mjs"))};`,
      `import {prepareLifecycleWarmControl as prepareCompletedSaveControl} from ${JSON.stringify(uri("lifecycle-warm-cache.mjs"))};\nimport {createLifecycleAttribution} from ${JSON.stringify(uri("lifecycle-allocation-attribution.mjs"))};\nlet lifecycleAttribution=null;`],
    ['  loadedIdle = await stable("loaded-idle");', '  loadedIdle = await stable("loaded-idle");\n' + start],
    ['      assert.equal(rendererAttribution,null,"One failure-only dump, none before actual budget failure");',
      '      await lifecycleAttribution?.settle(); // Close any diagnostic trace before original failure-only trace.\n      assert.equal(rendererAttribution,null,"One original failure-only dump");'],
    ['    if (observer) nativeFailureCapture = await observer.finishCapture();',
      '    if(lifecycleAttribution)progressProbe.lifecycleAttribution=await lifecycleAttribution.close();\n    if (observer) nativeFailureCapture = await observer.finishCapture();'],
    ['successfulFixtureValidations,6', 'successfulFixtureValidations,4'],
    ['row.event==="reused").length,16', 'row.event==="reused").length,8'],
    ['requestedSmallCompletedConversions:6', 'requestedSmallCompletedConversions:4'],
    ['"six-small-warm-cache-outputs-and-adverse-recovery-not-full-acceptance"', '"four-small-lifecycle-outputs-not-acceptance"'],
    ['"failed-original-startup-diagnostic"', '"failed-lifecycle-allocation-diagnostic"'],
    [scope, 'scope: "Diagnostic prefix of failed warm-cache sequence: three small complete outputs, write failure and one complete recovery. Up to six bounded light allocation dumps; timing/memory perturbed, no acceptance. Lower blank/all-tree250MiB/cores/validators/cancellation unchanged; no full original conversion or public/speed claim.",'],
  ]);
}
export function deriveLifecycleWarmCaller(source, root) {
  const parent = deriveWarmCacheCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const recipe = exactPatch(parent.generated, [
    [`import {deriveWarmCacheDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("warm-cache-qualification.mjs"))};`,
      `import {deriveLifecycleWarmDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("lifecycle-warm-cache.mjs"))};`],
    ['  const ownFiles=[', `  const ownFiles=[${files.map(JSON.stringify).join(",")},`],
    ['assert.equal(row.status,"six-small-warm-cache-outputs-and-adverse-recovery-not-full-acceptance");assert.equal(row.progressProbe.successfulSaveControl.successfulFixtureValidations,6);',
      'assert.equal(row.status,"four-small-lifecycle-outputs-not-acceptance");assert.equal(row.progressProbe.successfulSaveControl.successfulFixtureValidations,4);'],
    ['"warm-cache-small-output-controls-finished-pending-audit-not-acceptance"', '"lifecycle-diagnostic-finished-pending-audit-not-acceptance"'],
  ]);
  return { generated: recipe.generated.replaceAll('${stamp}-warm-cache-control-', '${stamp}-lifecycle-warm-control-')
    .replace('|warm-cache-control|memoized-handoff-control)', '|warm-cache-control|lifecycle-warm-control|memoized-handoff-control)'),
    publicAcceptance: false, fullOriginalAcceptance: false };
}
