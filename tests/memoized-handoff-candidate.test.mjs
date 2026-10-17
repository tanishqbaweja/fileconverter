import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { recoverStableProgressUiBaseline } from "../scripts/lib/stable-progress-ui-recipe.mjs";
import { makeMemoizedHandoffApp, makeMemoizedHandoffBuilder, deriveMemoizedHandoffCaller, deriveMemoizedHandoffDriver } from "../scripts/lib/memoized-handoff-candidate.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const archive = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz")));
test("display-tree reuse composes with exact existing worker handoff and progress compositing", async () => {
  const original = (await read("app/converter/ConverterApp.tsx")).toString(), result = makeMemoizedHandoffApp(original);
  let reversed = result.generated;
  for (const [before, after] of result.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(recoverStableProgressUiBaseline(reversed), original);
  assert.equal(result.progressSamplingChanged, false); assert.equal(result.codecSettingsChanged, false);
  await transform(result.generated, { loader: "tsx" });
  const builder = makeMemoizedHandoffBuilder((await read("scripts/build-staged-handoff-candidate.mjs")).toString(), root);
  assert.ok(builder.includes('displayTreeMemoization:true,progressSamplingChanged:false'));
  assert.ok(builder.includes('${stamp}-memoized-handoff-build.json'));
  await transform(builder, { loader: "js" });
});
test("only main app binding changes; source/full-process budget/worker/native/validation paths remain", async () => {
  const result = deriveMemoizedHandoffDriver(archive.driver, root, path.join(root, "work/recorded-timeline-full-wrapper-testABC"), "allocation-attempt-media-testABC", ["scripts/diagnose-memoized-handoff.mjs"]);
  for (const token of ['run.incrementalPrivateMiB <= 250', 'minimumMs: 300000', 'source = path.join(root, "test.mkv")',
    'await completedSaveControl.run(page)', 'progressSamplingChanged,false', 'memoizedAppBinding', 'conversion.worker-D_waeFU2.js']) assert.ok(result.generated.includes(token), token);
  await transform(result.generated, { loader: "js" });
  const caller = deriveMemoizedHandoffCaller((await read("scripts/run-updated-chrome-full.mjs")).toString(), root);
  assert.ok(caller.generated.includes('unchangedWorkers(build.assets),unchangedWorkers(qualified.build.assets)'));
  assert.ok(caller.generated.includes('${stamp}-memoized-handoff-control-live.json'));
  assert.ok(caller.generated.includes('environment.WITHIN_MEMO_HANDOFF_BUILD_SHA=sha(buildBytes)'));
  await transform(caller.generated, { loader: "js" });
});
