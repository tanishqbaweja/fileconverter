import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { transform } from "esbuild";
import { deriveOriginalStartupCaller, deriveOriginalStartupDriver } from "../scripts/lib/original-startup-control.mjs";

const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const parent = JSON.parse(gunzipSync(await read("outputs/reports/2026-10-16T17-01-47-260Z-updated-chrome-full-sources.json.gz"), { maxOutputLength: 8388608 }));
const wrapper = path.join(root, "work/recorded-timeline-full-wrapper-testABC");

test("bounded original startup keeps actual Chrome flags, source, lower blank and entire-tree gate", async () => {
  const recipe = deriveOriginalStartupDriver(parent.driver, root, wrapper, "allocation-attempt-media-testABC", ["scripts/diagnose-original-startup.mjs"]);
  const driver = recipe.generated;
  for (const token of ['source = path.join(root, "test.mkv")', 'minimumMs: 300000',
    'blankBaseline.privateBytes <= startupSettlement.earlyWindow.privateBytes', 'run.incrementalPrivateMiB <= 250',
    'startNativeBudgetFailureObserver(chrome.pid', 'headless=new', 'cancelBrowserConversionBeforeCleanup(page)',
    'Date.now()-conversionAt>=10000', 'run.startupControl.fullOutputValidationPerformed=false', 'requestedCompletedConversions:0'])
    assert.ok(driver.includes(token), token);
  const launch = text => text.match(/chrome = spawn\([\s\S]+?await recordLaunch\(chrome, "headless-chrome-root"\);/)[0];
  assert.equal(launch(driver), launch(parent.driver));
  assert.ok(!driver.includes('assert.equal(run.state.jobState, "complete",'));
  assert.equal(recipe.publicAcceptance, false); assert.equal(recipe.fullOriginalAcceptance, false);
  await transform(driver, { loader: "js" });
});

test("caller retains owned cleanup/source replay and uniquely scopes failure traces", async () => {
  const source = (await read("scripts/run-updated-chrome-full.mjs")).toString();
  const result = deriveOriginalStartupCaller(source, root), caller = result.generated;
  assert.ok(caller.includes('replaceAll("2026-10-15T22-27-06-823Z",stamp)'));
  assert.ok(caller.includes('completedRuns:row.runs.filter(run=>run.independentValidation!==null).length'));
  assert.ok(caller.includes('${stamp}-original-startup-${prepareOnly?'));
  assert.ok(caller.includes('await verifyStoppedTree()'));
  assert.ok(caller.includes('receipt.protectedAfter=await protectedSource()'));
  assert.ok(caller.includes('writeUpdatedFullArchive(root,stamp,snapshot,runtimeSources)'));
  await transform(caller, { loader: "js" });
});
