import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectCatalogueScrollDiagnostic } from "../scripts/lib/catalogue-scroll-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-17T18-06-27-397Z-catalogue-scroll-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path)));
test("incompleteABA with higher auto-scroll tiles cannot become accepted optimization or speed proof", () => {
  const result = inspectCatalogueScrollDiagnostic(terminal, report);
  assert.equal(result.points[1].rendererCompositorBytes, 23773968); assert.equal(result.points[3].rendererCompositorBytes, 27607824);
  assert.equal(result.abaCompleted, false); assert.equal(result.autoScrollRetained, false); assert.equal(result.repeatUnchanged, false);
});
test("reject fabricated third pass, changed error provenance, missing routes or trace failure", () => {
  for (const mutate of [r => { r.progressProbe.thirdCatalogueNavigation = {}; },
    r => { r.failure.message = "unrelated failure"; }, r => { r.progressProbe.secondCatalogueNavigation.routeCount = 24; },
    r => { r.progressProbe.catalogueAttribution.checkpoints[0].error = "failed dump"; }]) {
    const copy = structuredClone(report); mutate(copy); assert.throws(() => inspectCatalogueScrollDiagnostic(terminal, copy));
  }
});
