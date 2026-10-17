import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectCatalogueNavigation } from "../scripts/lib/catalogue-navigation-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-17T17-52-52-402Z-catalogue-navigation-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path)));
test("two405-route traversals expose transient rendering allocation without claiming conversion compliance", () => {
  const result = inspectCatalogueNavigation(terminal, report);
  assert.equal(result.points.length, 5); assert.equal(result.mediaConversions, 0); assert.equal(result.publicAcceptance, false);
  assert.deepEqual(result.points.map(row => row.rendererCompositorBytes), [6553600, 23773968, 6554384, 25084688, 6553600]);
  assert.deepEqual(result.points.map(row => row.workerV8MallocBytes), [61496, 61496, 61496, 61496, 61496]);
  assert.equal(result.previousConversionPeakCallsiteProven, false);
});
test("reject missing routes, sample loss, invented media success, overlapping traces or PID substitution", () => {
  for (const mutate of [r => { r.progressProbe.boundedCatalogue.routeCount = 24; },
    r => { r.progressProbe.successfulSaveControl.successfulFixtureValidations = 1; },
    r => { r.progressProbe.catalogueAttribution.maximumPending = 2; },
    r => { r.nativeMemory.phases.find(row => row.phase === "catalogue-first-navigation").unavailableSamples++; },
    r => { r.progressProbe.catalogueAttribution.checkpoints[1].state.metrics = { wasmMemoryBytes: 1 }; }]) {
    const copy = structuredClone(report); mutate(copy); assert.throws(() => inspectCatalogueNavigation(terminal, copy));
  }
});
