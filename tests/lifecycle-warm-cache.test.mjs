import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { deriveLifecycleWarmModule, deriveLifecycleWarmDriver, deriveLifecycleWarmCaller } from "../scripts/lib/lifecycle-warm-cache.mjs";
import { deriveWarmCacheModule } from "../scripts/lib/warm-cache-qualification.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("diagnostic module is reversible observation-only prefix, not an output-validator edit", async () => {
  const archive = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T16-41-46-137Z-updated-chrome-media-sources.json.gz")));
  const spec = archive.recipe.generated.spec, result = deriveLifecycleWarmModule(spec, root);
  let reversed = result.generated; for (const [before, after] of result.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, deriveWarmCacheModule(spec, root).generated);
  for (const token of ['await afterValidated()', 'post-write-error-before-recovery', 'expect(validated).toBe(4)', '[exerciseWriteFailure]']) assert.ok(result.generated.includes(token));
  await transform(result.generated, { loader: "ts" });
});
test("driver serializes pre/post and failure tracing; baseline/all-tree250MiB/native100ms/cleanup remain", async () => {
  const old = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const driver = deriveLifecycleWarmDriver(old.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", []);
  for (const token of ["minimumMs: 300000", "<=250", "await lifecycleAttribution?.settle()", "lifecycleAttribution.close()", 'requestedSmallCompletedConversions:4', 'successfulFixtureValidations,4']) assert.ok(driver.generated.includes(token), token);
  await transform(driver.generated, { loader: "js" });
  const caller = deriveLifecycleWarmCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root);
  assert.ok(caller.generated.includes('${stamp}-lifecycle-warm-control-live.json'));
  assert.ok(caller.generated.includes('await verifyStoppedTree()')); await transform(caller.generated, { loader: "js" });
});
