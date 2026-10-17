import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { makeStableProgressUiSource } from "../scripts/lib/stable-progress-ui-recipe.mjs";
import { makeMemoizedCacheApp, makeMemoizedCacheBuilder, deriveMemoizedCacheDriver, deriveMemoizedCacheCaller } from "../scripts/lib/memoized-cache-candidate.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("combined app reverses exactly to qualified display reuse; retains cache, original control JSX and progress", async () => {
  const app = (await read("app/converter/ConverterApp.tsx")).toString(), recipe = makeMemoizedCacheApp(app);
  let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, makeStableProgressUiSource(app));
  for (const token of ["bindCompiledCodecCache(new Worker", "const sourceInspectionSection = useMemo", "const mediaPlanSection = useMemo", "const capabilityStrip = useMemo", "const outputFormatOptions = useMemo", "scaleX(${progress / 100})"])
    assert.ok(recipe.generated.includes(token), token);
  assert.equal(recipe.progressSamplingChanged, false); assert.equal(recipe.userDataCached, false);
  await transform(recipe.generated, { loader: "tsx" });
  const builder = makeMemoizedCacheBuilder((await read("scripts/build-staged-handoff-candidate.mjs")).toString(), root);
  assert.ok(builder.includes("displayTreeMemoization:true,originalJsxAndControlsPreserved:true"));
  assert.ok(builder.includes("4f2ef88023d984d79d2eb04bdaa8628fc48b71b927369c0c2b8f864b28ab49ab"));
  await transform(builder, { loader: "js" });
});
test("actual six-output/fault qualification is unchanged except strict combined-build proof and owned namespace", async () => {
  const old = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const driver = deriveMemoizedCacheDriver(old.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", []);
  for (const token of ["minimumMs: 300000", "<=250", "successfulFixtureValidations,6", 'row.event==="reused").length,16', "displayTreeMemoization,true", "requestedCompletedConversions:0"])
    assert.ok(driver.generated.includes(token), token);
  await transform(driver.generated, { loader: "js" });
  const caller = deriveMemoizedCacheCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root);
  for (const token of ['${stamp}-memoized-cache-control-live.json', '"scripts/build-memoized-cache.mjs",stamp,"--for-browser"', "await verifyStoppedTree()"])
    assert.ok(caller.generated.includes(token), token);
  await transform(caller.generated, { loader: "js" });
});
