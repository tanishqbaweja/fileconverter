import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectCatalogueSlotFailure } from "../scripts/lib/catalogue-slot-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-17T18-26-10-502Z-catalogue-slot-control-terminal.json"));
const previous = JSON.parse(await readFile("evidence/2026-10-17T17-02-11-744Z-memoized-cache-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path))), build = JSON.parse(await readFile(terminal.build.path));
const oldReport = JSON.parse(gunzipSync(await readFile(previous.report.path))), oldBuild = JSON.parse(await readFile(previous.build.path));
test("real slot reuse and three validated outputs do not excuse failed recovery/all-process memory", () => {
  const result = inspectCatalogueSlotFailure(terminal, report, oldReport, build, oldBuild);
  assert.equal(result.firstNativeBreachMiB, 251.578125); assert.equal(result.completedSmallOutputs, 3);
  assert.equal(result.slotReuseSufficient, false); assert.equal(result.completedOriginalConversions, 0);
  assert.equal(result.speedGainProven, false); assert.equal(result.repeatUnchanged, false);
  assert.deepEqual(result.unavailableSamplesByPhase, [{ phase: "blank-startup-settle", unavailableSamples: 1 }]);
});
test("reject changed route count, DOM mutation, served app, worker or fabricated successful recovery", () => {
  for (const mutate of [(r) => { r.progressProbe.boundedCatalogue.routeCount = 24; },
    (r) => { r.progressProbe.boundedCatalogue.slotReuse.counts.addedArticles = 405; },
    (r) => { r.progressProbe.actualServedAsset.sha256 = "wrong"; },
    (r, b) => { b.assets.find(row => row.role === "codec-worker").sha256 = "wrong"; },
    (r) => { r.progressProbe.successfulSaveControl.successfulFixtureValidations = 6; }]) {
    const r = structuredClone(report), b = structuredClone(build); mutate(r, b);
    assert.throws(() => inspectCatalogueSlotFailure(terminal, r, oldReport, b, oldBuild));
  }
});
