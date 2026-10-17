import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync, gunzipSync } from "node:zlib";
import { transform, version as esbuildVersion } from "esbuild";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { deriveCompletedSaveModule, COMPLETED_SAVE_SPEC_SHA } from "./completed-save-control.mjs";
import { deriveCompiledCacheDriver, deriveCompiledCacheCaller } from "./compiled-cache-candidate.mjs";
const ownFiles = ["scripts/lib/warm-cache-qualification.mjs", "scripts/qualify-warm-cache.mjs", "tests/warm-cache-qualification.test.mjs"];
const nativePicker = `async function pickDiskFile(page:import("@playwright/test").Page,file:string){
  const session=await page.context().newCDPSession(page);
  try{const document=await session.send("DOM.getDocument");
    const {nodeId}=await session.send("DOM.querySelector",{nodeId:document.root.nodeId,selector:'[data-testid="file-input"]'});
    expect(nodeId).toBeGreaterThan(0);await session.send("DOM.setFileInputFiles",{nodeId,files:[file]});
  }finally{await session.detach();}
}
let afterValidated=()=>{};
function resetTelemetry(){for(const records of [bitrateAuditSamples,splitFinalSamples,asyncifyStorageSamples,inputReadFailureSamples,stackReserveSamples])records.length=0;}
async function validateConversion(page:import("@playwright/test").Page,adapter:typeof adapters[number],reload=true){
  resetTelemetry();await validateConversionOnce(page,adapter,reload);afterValidated();expect(rows.length).toBeLessThan(256);
}
`;
export function deriveWarmCacheModule(spec, root) {
  const parent = deriveCompletedSaveModule(spec, root);
  const recovery = spec.slice(spec.indexOf("async function recoverOnSamePage("), spec.indexOf("for (const adapter of adapters)"));
  assert.ok(recovery.includes("await validateConversion(page, adapter, false)"));
  const definitions = [recovery], adverseEdits = [];
  for (const [title, name] of [
    ["propagates direct output write failure and removes partial output", "exerciseWriteFailure"],
    ["cancels after genuine direct output and removes partial output", "exerciseCancellation"],
    ["propagates input read failure and removes partial output", "exerciseReadFailure"],
  ]) {
    const marker = `test("private split MPEG2 ${title}", async ({ page }) => {`;
    const begin = spec.indexOf(marker), end = spec.indexOf("\n});", begin);
    assert.ok(begin > 0 && end > begin);
    let generated = exactPatch(spec.slice(begin, end + 4), [[marker, `async function ${name}(page:import("@playwright/test").Page){`]]).generated;
    assert.ok(generated.endsWith("\n});")); generated = generated.slice(0, -3) + "}";
    const edits = [
      ['await page.goto("/?test=1&directory=1' + (name === "exerciseWriteFailure" ? '&fault=write' : '') + '");',
        'await page.evaluate(url=>history.replaceState(null,"",url),"/?test=1&directory=1' + (name === "exerciseWriteFailure" ? '&fault=write' : '') + '");'],
      [`await page.locator('[data-testid="file-input"]').setInputFiles(path.join(work, "${name === "exerciseCancellation" ? "cancel" : "hevc"}.mkv"));`,
        `await pickDiskFile(page,path.join(work,"${name === "exerciseCancellation" ? "cancel" : "hevc"}.mkv"));`],
    ];
    generated = exactPatch(generated, edits).generated;
    adverseEdits.push({ name, original: spec.slice(begin, end + 4), generated, edits }); definitions.push(generated);
  }
  const recipe = exactPatch(parent.source, [
    ["let work:string;", "let work:string;\n" + nativePicker + definitions.join("\n")],
    ["async function validateConversion(page: import(", "async function validateConversionOnce(page: import("],
    ['  fixtures.splice(0,1); // Only qualified96-frameHEVC fixture; no unrelated controls.',
      '  fixtures.splice(0,1);fixtures.push({...fixtures[0],name:"cancel",seconds:12}); // Original qualified cancellation fixture.'],
    ['  let validated=0;', '  let validated=0;afterValidated=()=>{validated++;};'],
    ['scope:"one-small-complete-production-conversion-and-successful-final-save-handoff-only"',
      'scope:"three-complete-small-outputs-then-write-cancel-read-faults-with-complete-same-page-recovery"'],
    ['      try{await validateConversion(page,adapters[0],false);validated=1;return report();}',
      `      try{
        for(let index=0;index<3;index++){await validateConversion(page,adapters[0],false);await page.waitForFunction(()=>window.__WITHIN_TEST__?.getState().workerStatus==="ready");}
        for(const exercise of [exerciseWriteFailure,exerciseCancellation,exerciseReadFailure]){resetTelemetry();await exercise(page);}
        expect(validated).toBe(6);return report();
      }`],
  ]);
  return { ...recipe, parentSourceSha256: sha(parent.source), originalValidatorSha256: parent.originalValidatorSha256,
    validatorSha256: parent.validatorSha256, validatorEdits: parent.validatorEdits, adverseEdits,
    validationAssertionsChanged: false, noPageReloadBetweenJobs: true, completeSmallOutputsRequired: 6,
    fullOriginalAcceptance: false, publicAcceptance: false };
}
export async function prepareWarmCacheControl(root, reportBase) {
  assert.equal(path.resolve(root), path.resolve(import.meta.dirname, "../.."));
  assert.equal(path.dirname(reportBase), path.join(root, "outputs/reports"));
  const proof = JSON.parse(await readFile(path.join(root, "evidence/2026-10-16T16-41-46-137Z-updated-chrome-media.json")));
  const zip = await readFile(path.join(root, proof.sourceArchive.path)); assert.equal(sha(zip), proof.sourceArchive.sha256);
  const raw = gunzipSync(zip, { maxOutputLength: 2097152 }); assert.equal(sha(raw), proof.sourceArchive.restoredSha256);
  const recipe = deriveWarmCacheModule(JSON.parse(raw).recipe.generated.spec, root);
  const javascript = (await transform(recipe.generated, { loader: "ts", format: "esm", target: "es2022" })).code;
  const archived = gzipSync(Buffer.from(javascript), { level: 9 }), archivePath = reportBase + "-warm-cache-module.mjs.gz";
  await writeFile(archivePath, archived, { flag: "wx" });
  const provenance = { qualifiedSpecSha256: COMPLETED_SAVE_SPEC_SHA, validatorSha256: recipe.validatorSha256,
    originalValidatorSha256: recipe.originalValidatorSha256, validatorEdits: recipe.validatorEdits, adverseEdits: recipe.adverseEdits,
    nativeDiskFilePickerBypass: true, validationAssertionsChanged: false, noPageReloadBetweenJobs: true,
    completeSmallOutputsRequired: 6, generatedTypescriptSha256: sha(recipe.generated), generatedJavascriptSha256: sha(javascript), esbuildVersion,
    archive: { path: path.relative(root, archivePath).replaceAll(path.sep, "/"), bytes: archived.length, sha256: sha(archived),
      restoredBytes: Buffer.byteLength(javascript), restoredSha256: sha(javascript) } };
  const generatedControl = await import("data:text/javascript;base64," + Buffer.from(javascript).toString("base64"));
  const control = await generatedControl.prepareCompletedSaveControl();
  return { ...control, report: () => ({ ...control.report(), provenance }) };
}
export function deriveWarmCacheDriver(...args) {
  const parent = deriveCompiledCacheDriver(...args), root = args[1];
  const begin = parent.generated.indexOf("  for (let number = 1; number <= 3; number++) {");
  const end = parent.generated.indexOf('  assert.equal(progressProbe.compiledCacheEvents.filter(row=>row.event==="compiled").length,2);', begin);
  assert.ok(begin > 0 && end > begin);
  const withoutOriginalStartupLoop = parent.generated.slice(0, begin) + parent.generated.slice(end);
  const scope = withoutOriginalStartupLoop.match(/scope: "One complete independently validated[^\r\n]+/)[0];
  return exactPatch(withoutOriginalStartupLoop, [
    [`import {prepareCompletedSaveControl} from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/completed-save-control.mjs")).href)};`,
      `import {prepareWarmCacheControl as prepareCompletedSaveControl} from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/warm-cache-qualification.mjs")).href)};`],
    ['assert.equal(progressProbe.successfulSaveControl.successfulFixtureValidations,1);', 'assert.equal(progressProbe.successfulSaveControl.successfulFixtureValidations,6);'],
    ['row.event==="reused").length,6', 'row.event==="reused").length,16'],
    ['assert.equal(diagnosticOnly,true);assert.equal(runs.length,3);assert.ok(runs.every(run=>run.startupControl?.cancellation.terminalState==="cancelled"));',
      'assert.equal(diagnosticOnly,true);assert.equal(runs.length,0);'],
    ['"three-original-startup-cancellations-observed-not-acceptance"', '"six-small-warm-cache-outputs-and-adverse-recovery-not-full-acceptance"'],
    ['requestedStartupControls:3, requestedCompletedConversions:0, requestedRuns:3,', 'requestedStartupControls:0, requestedCompletedConversions:0, requestedSmallCompletedConversions:6, requestedRuns:0,'],
    [scope, 'scope: "Six fully independently validated small browser outputs: three repeated cold/warm conversions, then production write failure, cancellation and input read failure with same-page complete warm-cache recovery each. Exact lower blank/all-tree250MiB/production cores/I/O, no full original conversion or public/speed/scaling acceptance.",'],
  ]);
}
export function deriveWarmCacheCaller(source, root) {
  const parent = deriveCompiledCacheCaller(source, root), uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const recipe = exactPatch(parent.generated, [
    [`import {deriveCompiledCacheDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("compiled-cache-candidate.mjs"))};`,
      `import {deriveWarmCacheDriver as deriveUpdatedChromeFullDriver} from ${JSON.stringify(uri("warm-cache-qualification.mjs"))};`],
    ['  const ownFiles=[', `  const ownFiles=[${ownFiles.map(JSON.stringify).join(",")},`],
    ['assert.equal(row.status,"three-original-startup-cancellations-observed-not-acceptance");assert.equal(row.progressProbe.successfulSaveControl.successfulFixtureValidations,1);assert.equal(row.runs.length,3);assert.ok(row.runs.every(run=>run.independentValidation===null&&run.startupControl?.cancellation.terminalState==="cancelled"));',
      'assert.equal(row.status,"six-small-warm-cache-outputs-and-adverse-recovery-not-full-acceptance");assert.equal(row.progressProbe.successfulSaveControl.successfulFixtureValidations,6);assert.equal(row.runs.length,0);'],
    ['"original-startup-controls-finished-pending-audit-not-acceptance"', '"warm-cache-small-output-controls-finished-pending-audit-not-acceptance"'],
  ]);
  return { generated: recipe.generated.replaceAll('${stamp}-compiled-cache-control-', '${stamp}-warm-cache-control-')
    .replace('|compiled-cache-control|memoized-handoff-control)', '|compiled-cache-control|warm-cache-control|memoized-handoff-control)'),
    publicAcceptance: false, fullOriginalAcceptance: false };
}
