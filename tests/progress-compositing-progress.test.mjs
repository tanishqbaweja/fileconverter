import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { loadRetainedCopyProgress } from "../scripts/lib/retained-split-copy-progress.mjs";
import { makeProgressCompositingProgressDriver, progressCompositingFiles } from "../scripts/lib/progress-compositing-progress-recipe.mjs";
import { baselineBinding, sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const retained = await loadRetainedCopyProgress(root);
const golden = JSON.parse(await read("evidence/2026-10-09T15-42-44-939Z-progress-compositing-golden-analysis.json"));
const helperUri = "file:///UNIT_ONLY_NOT_EXECUTED/trace-helper.mjs";
const make = (source = retained.executed.generated, app = golden.actualServedApp, css = golden.actualServedStylesheet) =>
  makeProgressCompositingProgressDriver(source, root, helperUri, app, css);

test("Full-input candidate derives reversibly from JS-copy control, not rejected kernel; exact new App/CSS guards", () => {
  const recipe = make(); let source = recipe.generated;
  for (const [before, after] of recipe.patches.toReversed()) source = source.replace(after, before);
  assert.equal(source, recipe.previous.generated); assert.equal(sha(recipe.generated), recipe.generatedSha256);
  const syntax = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true });
  assert.equal(syntax.status, 0, syntax.stderr);
  assert.ok(recipe.generated.includes(JSON.stringify(golden.actualServedApp)) && recipe.generated.includes(JSON.stringify(golden.actualServedStylesheet)));
  assert.ok(recipe.generated.includes('["scripts/stage-mpeg2-late-allocator-abort.mjs", "stage"]'));
  assert.ok(!recipe.generated.includes('["scripts/stage-split-copy-layout.mjs", "stage"]'));
  assert.ok(recipe.generated.includes("originalJsCopyTransport\":true"));
  for (const file of progressCompositingFiles) assert.ok(recipe.generated.includes(JSON.stringify(file)));
});

test("No full-file, blank, codec, quality, native-memory, writer, cancellation, completion or hidden-process gates weakened", () => {
  const recipe = make(), source = recipe.generated;
  for (const token of ['const expectedSourceBytes = 2958573265', '"--headless=new"', 'minimumMs: 300000', 'maximumConversionMs":300000',
    'checkpointOutputBytes":67108864', 'run.incrementalPrivateMiB <= 250', 'assert.equal(run.state.jobState, "complete"',
    'assert.ok(ssim >= 0.98)', 'assert.equal(manifest.aggregateWasmMemoryBytes, 48 * MiB)', 'fixed32+16MiB', 'metrics.peakPendingOperations <= 1',
    'await cancelBrowserConversionBeforeCleanup(page)', 'No hidden allocation profiler', 'Never kill an unrelated or reused PID',
    'await recordLaunch(server', 'await recordLaunch(chrome', 'observeOwnedProcessExit(identity)'])
    assert.ok(source.includes(token), token);
  assert.equal(recipe.previous.expectedAsset.sha256, baselineBinding.sha256);
  assert.ok(!source.includes('windowsHide: false') && !source.includes('"--headed"'));
  assert.equal(retained.baseline.raw.runs[0].independentValidation, null, "Retained baseline is partial, never completed acceptance");
});

test("Unbound stylesheet/source/default UI rejected; controller has one launch and no baseline rerun", async () => {
  assert.throws(() => make(retained.executed.generated + "\n"));
  assert.throws(() => make(retained.executed.generated, baselineBinding));
  assert.throws(() => make(retained.executed.generated, golden.actualServedApp, { ...golden.actualServedStylesheet, matrixCssSha256: "0".repeat(64) }));
  assert.throws(() => make(retained.executed.generated, golden.actualServedApp, { ...golden.actualServedStylesheet, afterBytes: 1 }));
  const controller = (await read("scripts/diagnose-progress-compositing-original.mjs")).toString();
  assert.equal((controller.match(/child = spawn\(/g) ?? []).length, 1); assert.ok(controller.includes("noBaselineRerun: true"));
  assert.ok(controller.includes("sourcePreimages") && controller.includes('encoding: "base64"'));
  assert.ok(controller.includes("never") || controller.includes("Never"));
  assert.ok(controller.includes("32 * 1024 ** 3") && controller.includes("inspectStressHostMemory"));
});
