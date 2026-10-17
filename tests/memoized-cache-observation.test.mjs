import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectMemoizedCacheFailure } from "../scripts/lib/memoized-cache-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-17T17-02-11-744Z-memoized-cache-control-terminal.json"));
const previous = JSON.parse(await readFile("evidence/2026-10-17T04-17-55-073Z-warm-cache-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path))), build = JSON.parse(await readFile(terminal.build.path));
const oldReport = JSON.parse(gunzipSync(await readFile(previous.report.path))), oldBuild = JSON.parse(await readFile(previous.build.path));
test("combined candidate fails recovery despite three genuine identical outputs", () => {
  const result = inspectMemoizedCacheFailure(terminal, report, oldReport, build, oldBuild);
  assert.equal(result.firstNativeBreachMiB, 252.68359375);
  assert.ok(result.peakIncrementalPrivateMiB >= result.firstNativeBreachMiB);
  assert.equal(result.completedSmallOutputs, 3); assert.equal(result.completedOriginalConversions, 0);
  assert.equal(result.combinedCandidateSufficient, false); assert.equal(result.speedGainProven, false);
});
test("reject a substituted app, changed codec, false pass or lost cancellation", () => {
  for (const mutate of [
    (r) => { r.progressProbe.actualServedAsset.sha256 = "wrong"; },
    (r, b) => { b.assets.find(row => row.role === "codec-worker").sha256 = "wrong"; },
    (r, b) => { b.displayTreeMemoization = false; },
    (r) => { r.quiescedBudgetCapture.oldWorkerCloseObserved = false; },
    (r) => { r.progressProbe.successfulSaveControl.successfulFixtureValidations = 6; },
  ]) {
    const r = structuredClone(report), b = structuredClone(build); mutate(r, b);
    assert.throws(() => inspectMemoizedCacheFailure(terminal, r, oldReport, b, oldBuild));
  }
});
