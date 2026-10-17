import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { makeCompiledCacheApp, makeCompiledCacheWorker, makeCompiledCacheBuilder, deriveCompiledCacheDriver, deriveCompiledCacheCaller } from "../scripts/lib/compiled-cache-candidate.mjs";
import { makeCompositedHandoffApp } from "../scripts/lib/composited-handoff-recipe.mjs";
import { makeStagedHandoffWorker } from "../scripts/lib/staged-worker-handoff-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("candidate changes only compiled-module transport around original handoff; native settings/writer/control bodies preserved", async () => {
  const app = (await read("app/converter/ConverterApp.tsx")).toString(), worker = (await read("workers/conversion.worker.ts")).toString();
  for (const [result, parent, loader] of [[makeCompiledCacheApp(app), makeCompositedHandoffApp(app), "tsx"], [makeCompiledCacheWorker(worker), makeStagedHandoffWorker(worker), "ts"]]) {
    let reversed = result.generated;
    for (const [before, after] of result.edits.toReversed()) reversed = reversed.replace(after, before);
    assert.equal(reversed, parent.generated); await transform(result.generated, { loader });
  }
  const builder = makeCompiledCacheBuilder((await read("scripts/build-staged-handoff-candidate.mjs")).toString(), root);
  assert.ok(builder.includes('maximumCompiledCodecModules:2,userDataCached:false,instancesShared:false'));
  await transform(builder, { loader: "js" });
});
test("driver binds actual app and codec assets but keeps all-process budget, original input, lower blank and independent fixture gates", async () => {
  const archive = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
  const result = deriveCompiledCacheDriver(archive.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", ["scripts/diagnose-compiled-cache.mjs"]);
  for (const token of ['run.incrementalPrivateMiB <= 250', 'minimumMs: 300000', 'await completedSaveControl.run(page)',
    'cachedAppBinding', 'cachedCodecBinding', 'row.event==="reused").length,6', 'source = path.join(root, "test.mkv")']) assert.ok(result.generated.includes(token), token);
  await transform(result.generated, { loader: "js" });
  const caller = deriveCompiledCacheCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root);
  assert.ok(caller.generated.includes('${stamp}-compiled-cache-control-live.json'));
  assert.ok(caller.generated.includes('saver(build.assets),saver(qualified.build.assets)'));
  assert.ok(caller.generated.includes('await verifyStoppedTree()'));
  await transform(caller.generated, { loader: "js" });
});
