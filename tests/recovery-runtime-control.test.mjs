import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { deriveWarmCacheModule } from "../scripts/lib/warm-cache-qualification.mjs";
import { deriveRecoveryRuntimeModule, deriveRecoveryRuntimeDriver, deriveRecoveryRuntimeCaller } from "../scripts/lib/recovery-runtime-control.mjs";
const root = process.cwd();
test("trace hooks reverse exactly to full6output qualification; every validator/adverse body is preserved", async () => {
  const source = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-16T16-41-46-137Z-updated-chrome-media-sources.json.gz"))).recipe.generated.spec;
  const parent = deriveWarmCacheModule(source, root), recipe = deriveRecoveryRuntimeModule(source, root);
  let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, parent.generated); assert.equal(recipe.validatorSha256, parent.validatorSha256);
  assert.ok(recipe.generated.includes('try{await recoverOnSamePage(page, originalWorker, "write-failure");}finally{await afterRecovery();}'));
  for (const name of ["exerciseWriteFailure", "exerciseCancellation", "exerciseReadFailure", "expect(validated).toBe(6)"]) assert.ok(recipe.generated.includes(name));
  await transform(recipe.generated, { loader: "ts" });
});
test("trace closes before original failure dump; never delays cancellation with heap sampling or changes production assets", async () => {
  const source = JSON.parse(gunzipSync(await readFile("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz"))).driver;
  const recipe = deriveRecoveryRuntimeDriver(source, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", []);
  for (const token of ["minimumMs: 300000", "successfulFixtureValidations,6", "<=250", "recoveryExecution?.noteBudgetFailure(event)", "prior event trace closed"])
    assert.ok(recipe.generated.includes(token), token);
  assert.ok(recipe.generated.indexOf('recoveryExecution.stop("after-production-cancel")') > recipe.generated.indexOf("cancelBrowserConversionBeforeCleanup(page)"));
  await transform(recipe.generated, { loader: "js" });
  const caller = deriveRecoveryRuntimeCaller(await readFile("scripts/run-updated-chrome-full.mjs", "utf8"), root);
  for (const token of ['${stamp}-recovery-runtime-control-live.json', '"scripts/build-catalogue-slot.mjs",stamp,"--for-browser"', "await verifyStoppedTree()"])
    assert.ok(caller.generated.includes(token), token);
  await transform(caller.generated, { loader: "js" });
});
