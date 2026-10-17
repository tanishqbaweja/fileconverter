import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectBoundedCatalogueFailure } from "../scripts/lib/bounded-catalogue-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-17T17-37-32-521Z-bounded-catalogue-control-terminal.json"));
const previous = JSON.parse(await readFile("evidence/2026-10-17T17-02-11-744Z-memoized-cache-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path))), build = JSON.parse(await readFile(terminal.build.path));
const oldReport = JSON.parse(gunzipSync(await readFile(previous.report.path))), oldBuild = JSON.parse(await readFile(previous.build.path));
test("catalogue availability is not conversion acceptance; retain complete process-tree breach", () => {
  const result = inspectBoundedCatalogueFailure(terminal, report, oldReport, build, oldBuild);
  assert.equal(result.firstNativeBreachMiB, 253.58203125); assert.ok(result.peakIncrementalPrivateMiB >= result.firstNativeBreachMiB);
  assert.equal(result.completedSmallOutputs, 0); assert.equal(result.repeatUnchanged, false); assert.equal(result.publicAcceptance, false);
});
test("reject omitted routes, changed worker, invented successful output or lost automatic cleanup", () => {
  for (const change of [(r) => { r.progressProbe.boundedCatalogue.routeCount = 24; },
    (r, b) => { b.assets.find(row => row.role === "codec-worker").sha256 = "wrong"; },
    (r) => { r.progressProbe.successfulSaveControl.successfulFixtureValidations = 6; },
    (r) => { r.quiescedBudgetCapture.oldWorkerCloseObserved = false; }]) {
    const r = structuredClone(report), b = structuredClone(build); change(r, b);
    assert.throws(() => inspectBoundedCatalogueFailure(terminal, r, oldReport, b, oldBuild));
  }
});
