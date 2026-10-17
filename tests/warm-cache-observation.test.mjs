import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectWarmCacheFailure } from "../scripts/lib/warm-cache-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-17T04-17-55-073Z-warm-cache-control-terminal.json"));
const previous = JSON.parse(await readFile("evidence/2026-10-17T04-01-20-706Z-compiled-cache-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path))), build = JSON.parse(await readFile(terminal.build.path));
const oldReport = JSON.parse(gunzipSync(await readFile(previous.report.path))), oldBuild = JSON.parse(await readFile(previous.build.path));
test("three byte-identical small outputs do not excuse failed all-tree recovery or imply original success", () => {
  const result = inspectWarmCacheFailure(terminal, report, oldReport, build, oldBuild);
  assert.equal(result.firstNativeBreachMiB, 251.01171875); assert.equal(result.peakIncrementalPrivateMiB, 251.96484375);
  assert.equal(result.completedWarmOutputs, 2); assert.equal(result.compiledCacheAloneSufficient, false);
  assert.equal(result.completeAdverseRecoveryValidated, false); assert.equal(result.repeatUnchanged, false);
  assert.equal(result.completedOriginalConversions, 0); assert.equal(result.publicAcceptance, false);
});
test("reject changed packets, missing samples, false recovery counts or lost cancellation", () => {
  for (const mutate of [r => { r.progressProbe.successfulSaveControl.successfulFixtureValidations = 6; },
    r => { r.progressProbe.successfulSaveControl.rows.find(row => row.kind === "independent-packet-order-proof").decodedVideoHash = "changed"; },
    r => { r.nativeMemory.phases.find(row => row.phase === "conversion-completed-save-control").unavailableSamples++; },
    r => { r.quiescedBudgetCapture.oldWorkerCloseObserved = false; }]) {
    const copy = structuredClone(report); mutate(copy);
    assert.throws(() => inspectWarmCacheFailure(terminal, copy, oldReport, build, oldBuild));
  }
});
