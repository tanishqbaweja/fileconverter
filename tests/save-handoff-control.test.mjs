import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { deriveCompletedSaveModule } from "../scripts/lib/completed-save-control.mjs";
import { deriveSaveHandoffCaller, deriveSaveHandoffDriver } from "../scripts/lib/save-handoff-control.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const media = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T16-41-46-137Z-updated-chrome-media-sources.json.gz"))).recipe.generated;
const full = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
test("all executed validation bytes stay exact except explicit full-driver disk-file picker bypass", async () => {
  const result = deriveCompletedSaveModule(media.spec, root);
  const validator = media.spec.slice(media.spec.indexOf("async function validateConversion("), media.spec.indexOf("async function recoverOnSamePage("));
  const [before, after] = result.validatorEdits[0];
  assert.ok(validator.includes(before));
  assert.ok(result.source.includes(validator.replace(before, after)));
  assert.equal(result.validatorEdits.length, 1);
  assert.ok(after.includes('fixtureInput.send("DOM.setFileInputFiles",{nodeId,files:[source]})'));
  assert.ok(!result.source.includes('.setInputFiles(source)'));
  assert.ok(result.source.includes('fixtures.splice(0,1)'));
  assert.ok(result.source.includes('await validateConversion(page,adapters[0],false)'));
  assert.ok(result.source.includes('await owned.close()'));
  assert.ok(result.source.includes('page.off("console",capture)'));
  await transform(result.source, { loader: "ts", format: "esm", target: "es2022" });
  assert.throws(() => deriveCompletedSaveModule(media.spec + "\n", root));
});
test("full launcher still uses original input and primary baseline after one completed fixture save", async () => {
  const result = deriveSaveHandoffDriver(full.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", ["scripts/diagnose-save-handoff.mjs"]);
  for (const text of ['await completedSaveControl.run(page)', 'source = path.join(root, "test.mkv")',
    'minimumMs: 300000', 'run.incrementalPrivateMiB <= 250', 'await completedSaveControl.close()',
    'post-successful-save-idle', 'progressProbe.successfulSaveControl=completedSaveControl.report()']) assert.ok(result.generated.includes(text), text);
  await transform(result.generated, { loader: "js" });
  const caller = deriveSaveHandoffCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root);
  assert.ok(caller.generated.includes('${stamp}-save-handoff-control-live.json'));
  assert.ok(caller.generated.includes('row.progressProbe.successfulSaveControl.successfulFixtureValidations,1'));
  assert.ok(caller.generated.includes('await verifyStoppedTree()'));
  await transform(caller.generated, { loader: "js" });
});
