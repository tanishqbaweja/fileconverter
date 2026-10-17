import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { transform, version as esbuildVersion } from "esbuild";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { deriveWarmCacheModule } from "./warm-cache-qualification.mjs";
import { deriveCatalogueSlotDriver, deriveCatalogueSlotCaller } from "./catalogue-slot-control.mjs";
const files = ["scripts/lib/recovery-execution-trace.mjs", "scripts/lib/recovery-runtime-control.mjs", "scripts/diagnose-recovery-runtime.mjs",
  "tests/recovery-execution-trace.test.mjs", "tests/recovery-runtime-control.test.mjs",
  "evidence/2026-10-17T21-11-43-044Z-recovery-trace-capability.json.gz", "outputs/reports/2026-10-17T21-11-43-044Z-recovery-trace-capability.json.gz"];
export function deriveRecoveryRuntimeModule(spec, root) {
  const parent = deriveWarmCacheModule(spec, root);
  return { ...exactPatch(parent.generated, [
    ['let work:string;', `let work:string;
let beforeRecovery:()=>Promise<unknown>=async()=>{},afterRecovery:()=>Promise<unknown>=async()=>{};
export function setRecoveryHooks(before:()=>Promise<unknown>,after:()=>Promise<unknown>){beforeRecovery=before;afterRecovery=after;}`],
    ['await recoverOnSamePage(page, originalWorker, "write-failure");',
      'await beforeRecovery();\n  try{await recoverOnSamePage(page, originalWorker, "write-failure");}finally{await afterRecovery();}'],
  ]), parentSourceSha256: sha(parent.generated), validatorSha256: parent.validatorSha256,
    originalValidatorSha256: parent.originalValidatorSha256, validatorEdits: parent.validatorEdits,
    adverseEdits: parent.adverseEdits, validationAssertionsChanged: false, noPageReloadBetweenJobs: true };
}
export async function prepareRecoveryRuntimeControl(root, reportBase) {
  assert.equal(root, path.resolve(import.meta.dirname, "../..")); assert.equal(path.dirname(reportBase), path.join(root, "outputs/reports"));
  const proof = JSON.parse(await readFile(path.join(root, "evidence/2026-10-16T16-41-46-137Z-updated-chrome-media.json")));
  const zipped = await readFile(path.join(root, proof.sourceArchive.path)); assert.equal(sha(zipped), proof.sourceArchive.sha256);
  const raw = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(sha(raw), proof.sourceArchive.restoredSha256);
  const recipe = deriveRecoveryRuntimeModule(JSON.parse(raw).recipe.generated.spec, root);
  const javascript = (await transform(recipe.generated, { loader: "ts", format: "esm", target: "es2022" })).code;
  const bytes = Buffer.from(javascript), compressed = gzipSync(bytes, { level: 9 }), file = reportBase + "-recovery-runtime-module.mjs.gz";
  await writeFile(file, compressed, { flag: "wx" });
  const loaded = await import(`data:text/javascript;base64,${bytes.toString("base64")}`);
  const control = await loaded.prepareCompletedSaveControl();
  const provenance = { generatedTypescriptSha256: sha(recipe.generated), generatedJavascriptSha256: sha(bytes), esbuildVersion,
    parentSourceSha256: recipe.parentSourceSha256, validatorSha256: recipe.validatorSha256, originalValidatorSha256: recipe.originalValidatorSha256,
    validatorEdits: recipe.validatorEdits, adverseEdits: recipe.adverseEdits, executionObservationOnlyEdits: recipe.edits,
    validationAssertionsChanged: false, noPageReloadBetweenJobs: true, nativeDiskFilePickerBypass: true,
    completeSmallOutputsRequired: 6, perturbsMemory: true, acceptanceMetric: false,
    archive: { path: path.relative(root, file).replaceAll(path.sep, "/"), bytes: compressed.length, sha256: sha(compressed), restoredBytes: bytes.length, restoredSha256: sha(bytes) } };
  return { ...control, setRecoveryHooks: loaded.setRecoveryHooks, report: () => ({ ...control.report(), provenance }) };
}
export function deriveRecoveryRuntimeDriver(...args) {
  const parent = deriveCatalogueSlotDriver(...args), root = args[1], uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  return exactPatch(parent.generated, [
    [`import {prepareWarmCacheControl as prepareCompletedSaveControl} from ${JSON.stringify(uri("warm-cache-qualification.mjs"))};`,
      `import {prepareRecoveryRuntimeControl as prepareCompletedSaveControl} from ${JSON.stringify(uri("recovery-runtime-control.mjs"))};\nimport {createRecoveryExecutionTrace} from ${JSON.stringify(uri("recovery-execution-trace.mjs"))};\nlet recoveryExecution=null;`],
    ['  completedSaveControl=await prepareCompletedSaveControl(root,reportBase);',
      `  completedSaveControl=await prepareCompletedSaveControl(root,reportBase);
  completedSaveControl.setRecoveryHooks(async()=>{recoveryExecution=createRecoveryExecutionTrace({root,reportBase,createSession:()=>browser.newBrowserCDPSession()});await recoveryExecution.start();},
    async()=>{if(recoveryExecution)progressProbe.recoveryExecution=await recoveryExecution.stop("after-write-recovery");});`],
    ['    onFailure: async event => {', '    onFailure: async event => {\n      recoveryExecution?.noteBudgetFailure(event); // Synchronous, original cancellation remains immediate.'],
    ['      assert.equal(rendererAttribution,null,"One failure-only dump, none before actual budget failure");',
      '      if(recoveryExecution)progressProbe.recoveryExecution=await recoveryExecution.stop("after-production-cancel");\n      assert.equal(rendererAttribution,null,"One failure-only dump, prior event trace closed");'],
    ['    if (observer) nativeFailureCapture = await observer.finishCapture();',
      '    if(recoveryExecution)progressProbe.recoveryExecution=await recoveryExecution.stop();\n    if (observer) nativeFailureCapture = await observer.finishCapture();'],
    ['"six-small-warm-cache-outputs-and-adverse-recovery-not-full-acceptance"', '"six-small-recovery-runtime-diagnostic-not-acceptance"'],
    ['"failed-original-startup-diagnostic"', '"failed-recovery-runtime-diagnostic"'],
    [parent.generated.match(/scope: "Six fully independently validated[^\r\n]+/)[0],
      'scope: "Diagnostic around actual post-write-failure recovery only:1MiB bounded V8/Wasm/GC event trace, no forced GC/browser flags/engine/native/UI changes. Same six outputs/adverse controls, exact validators/lower blank/all-process250MiB guard and immediate cancellation. Instrumentation perturbs memory; no public/full-original/speed acceptance.",'],
  ]);
}
export function deriveRecoveryRuntimeCaller(source, root) {
  const parent = deriveCatalogueSlotCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const result = exactPatch(parent.generated, [
    [`import {deriveCatalogueSlotDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("catalogue-slot-control.mjs"))};`,
      `import {deriveRecoveryRuntimeDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("recovery-runtime-control.mjs"))};`],
    ['  const ownFiles=[', `  const ownFiles=[${files.map(JSON.stringify).join(",")},`],
    ['assert.equal(row.status,"six-small-warm-cache-outputs-and-adverse-recovery-not-full-acceptance");', 'assert.equal(row.status,"six-small-recovery-runtime-diagnostic-not-acceptance");'],
    ['"warm-cache-small-output-controls-finished-pending-audit-not-acceptance"', '"recovery-runtime-diagnostic-finished-pending-audit-not-acceptance"'],
  ]);
  return { generated: result.generated.replaceAll('${stamp}-catalogue-slot-control-', '${stamp}-recovery-runtime-control-')
    .replace('|catalogue-slot-control|paint-boundary-control', '|catalogue-slot-control|recovery-runtime-control|paint-boundary-control'), publicAcceptance: false };
}
