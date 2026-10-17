import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { deriveWarmCacheModule, deriveWarmCacheDriver, deriveWarmCacheCaller } from "../scripts/lib/warm-cache-qualification.mjs";
import { deriveCompletedSaveModule } from "../scripts/lib/completed-save-control.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const archive = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T16-41-46-137Z-updated-chrome-media-sources.json.gz")));
const spec = archive.recipe.generated.spec;
test("six warm outputs retain exact validator assertions and original three adverse bodies apart from same-page picker adapters", async () => {
  const result = deriveWarmCacheModule(spec, root), parent = deriveCompletedSaveModule(spec, root);
  let reversed = result.generated;
  for (const [before, after] of result.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, parent.source); assert.equal(result.validatorSha256, parent.validatorSha256);
  assert.equal(result.adverseEdits.length, 3);
  for (const row of result.adverseEdits) {
    let body = row.generated;
    for (const [before, after] of row.edits.toReversed()) body = body.replace(after, before);
    const start = row.original.slice(0, row.original.indexOf("\n"));
    body = body.replace(`async function ${row.name}(page:import("@playwright/test").Page){`, start);
    body = body.slice(0, -1) + "});";
    assert.equal(body, row.original);
  }
  assert.equal(result.validationAssertionsChanged, false); assert.ok(result.generated.includes("expect(validated).toBe(6)"));
  await transform(result.generated, { loader: "ts" });
});
test("qualification keeps lower blank/native100ms/250MiB and cleanup, removes original startup loop honestly", async () => {
  const old = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const driver = deriveWarmCacheDriver(old.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", []);
  assert.ok(!driver.generated.includes("for (let number = 1; number <= 3; number++)"));
  for (const token of ["minimumMs: 300000", "<=250", 'row.event==="reused").length,16', "requestedCompletedConversions:0", "requestedSmallCompletedConversions:6", "await completedSaveControl.close()"])
    assert.ok(driver.generated.includes(token), token);
  await transform(driver.generated, { loader: "js" });
  const caller = deriveWarmCacheCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root);
  for (const token of ['${stamp}-warm-cache-control-live.json', 'await verifyStoppedTree()', 'successfulFixtureValidations,6', 'saver(build.assets),saver(qualified.build.assets)'])
    assert.ok(caller.generated.includes(token), token);
  await transform(caller.generated, { loader: "js" });
});
