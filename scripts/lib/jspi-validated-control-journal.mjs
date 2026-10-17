import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { transform, version as esbuildVersion } from "esbuild";
import { deriveWarmCacheModule } from "./warm-cache-qualification.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export function deriveJournaledJspiControl(spec, root) {
  const parent = deriveWarmCacheModule(spec, root);
  const recipe = exactPatch(parent.generated, [
    ['let work:string;', 'let work:string;\nlet onValidatedControl:(report:any)=>Promise<void>=async()=>{};\nexport function setValidatedControlCheckpoint(callback:(report:any)=>Promise<void>){onValidatedControl=callback;}'],
    ['afterValidated();expect(rows.length)', 'await afterValidated();expect(rows.length)'],
    ['afterValidated=()=>{validated++;};', 'afterValidated=async()=>{validated++;await onValidatedControl(report());};'],
  ]);
  return { ...recipe, validatorSha256: parent.validatorSha256, originalValidatorSha256: parent.originalValidatorSha256,
    validatorEdits: parent.validatorEdits, adverseEdits: parent.adverseEdits, parentSourceSha256: sha(parent.generated),
    validatorsChanged: false, checkpointsAfterOriginalValidatorAndOutputCleanup: true, publicAcceptance: false };
}
export async function prepareJournaledJspiControl(root, reportBase) {
  assert.equal(path.dirname(reportBase), path.join(root, "outputs/reports"));
  const proof = JSON.parse(await readFile(path.join(root, "evidence/2026-10-16T16-41-46-137Z-updated-chrome-media.json")));
  const zipped = await readFile(path.join(root, proof.sourceArchive.path)); assert.equal(sha(zipped), proof.sourceArchive.sha256);
  const original = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(sha(original), proof.sourceArchive.restoredSha256);
  const recipe = deriveJournaledJspiControl(JSON.parse(original).recipe.generated.spec, root);
  const code = (await transform(recipe.generated, { loader: "ts", format: "esm", target: "es2022" })).code;
  const raw = Buffer.from(code), compressed = gzipSync(raw, { level: 9 }), file = reportBase + "-jspi-warm-cache-module.mjs.gz";
  await writeFile(file, compressed, { flag: "wx" });
  const provenance = { generatedTypescriptSha256: sha(recipe.generated), generatedJavascriptSha256: sha(raw), esbuildVersion,
    validatorSha256: recipe.validatorSha256, originalValidatorSha256: recipe.originalValidatorSha256,
    validatorEdits: recipe.validatorEdits, adverseEdits: recipe.adverseEdits, journalOnlyEdits: recipe.edits,
    validationAssertionsChanged: false, noPageReloadBetweenJobs: true, completeSmallOutputsRequired: 6,
    archive: { path: path.relative(root, file).replaceAll(path.sep, "/"), bytes: compressed.length, sha256: sha(compressed), restoredBytes: raw.length, restoredSha256: sha(raw) } };
  const loaded = await import(`data:text/javascript;base64,${raw.toString("base64")}`), records = [];
  let previousRows = 0, pending = false;
  loaded.setValidatedControlCheckpoint(async report => {
    assert.equal(pending, false); pending = true;
    try {
      assert.equal(report.successfulFixtureValidations, records.length + 1); assert.ok(records.length < 6);
      assert.ok(report.rows.length <= 256 && report.rows.length >= previousRows);
      const delta = report.rows.slice(previousRows), count = report.successfulFixtureValidations;
      const payload = Buffer.from(JSON.stringify({ recordedAt: new Date().toISOString(), completedValidatedControls: count,
        sourceModuleSha256: sha(raw), validatorSha256: recipe.validatorSha256, rows: delta,
        originalValidatorAndOutputCleanupCompleted: true, originalFileCompleted: false, memoryAcceptance: false, publicAcceptance: false }));
      assert.ok(payload.length <= 1048576); const gz = gzipSync(payload, { level: 9 });
      const checkpoint = reportBase + `-jspi-validated-control-${count}.json.gz`;
      await writeFile(checkpoint, gz, { flag: "wx" }); assert.deepEqual(gunzipSync(await readFile(checkpoint)), payload);
      records.push({ path: path.relative(root, checkpoint).replaceAll(path.sep, "/"), bytes: gz.length, sha256: sha(gz), restoredBytes: payload.length,
        restoredSha256: sha(payload), completedValidatedControls: count }); previousRows = report.rows.length;
    } finally { pending = false; }
  });
  const control = await loaded.prepareCompletedSaveControl();
  return { ...control, report: () => ({ ...control.report(), provenance, validatedControlCheckpoints: [...records] }) };
}
