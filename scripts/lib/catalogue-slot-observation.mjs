import assert from "node:assert/strict";
import { inspectWarmCacheFailure } from "./warm-cache-observation.mjs";
import { PAINT_BASE_CSS } from "./paint-boundary-candidate.mjs";
import { CATALOGUE_CSS } from "./bounded-catalogue-candidate.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export function inspectCatalogueSlotFailure(terminal, report, previousReport, build, previousBuild) {
  assert.equal(build.catalogueSlotsReused, true); assert.equal(build.statelessCardsOnly, true); assert.equal(build.privateCatalogueEdits, 2);
  assert.equal(build.originalJsxAndControlsPreserved, false); assert.equal(build.conversionControlsPreserved, true);
  assert.equal(build.catalogueCardsPreserved, true); assert.equal(build.maximumMountedCatalogueCards, 24);
  for (const key of ["nativeWasmChanged", "codecParametersChanged", "progressSamplingChanged", "normalSourcesEdited"]) assert.equal(build[key], false);
  const app = build.assets.find(row => row.role === "application");
  assert.equal(app.bytes, 324963); assert.equal(app.sha256, "d027adf4cfbd9943f28917a6fca66df5f4ea9bfe847dabbae3f01b093f29ced7");
  const binding = ({ url, bytes, sha256 }) => ({ url, bytes, sha256 });
  assert.deepEqual(report.progressProbe.actualServedAsset, binding(app));
  assert.deepEqual(build.assets.filter(row => row.role !== "application").map(binding), previousBuild.assets.filter(row => row.role !== "application").map(binding));
  assert.ok(report.cssCandidate.css.endsWith(CATALOGUE_CSS));
  assert.equal(sha(PAINT_BASE_CSS + report.cssCandidate.css), report.progressProbe.expectedStylesheet.afterSha256);
  const catalogue = report.progressProbe.boundedCatalogue;
  assert.equal(catalogue.routeCount, 405); assert.equal(catalogue.pagesVisited, 17); assert.equal(catalogue.maxMounted, 24);
  assert.equal(catalogue.everyOriginalCardIdentical, true); assert.equal(catalogue.everyRegistryIdAvailable, true);
  assert.equal(catalogue.slotReuse.pageArticlesCreated, 0); assert.equal(catalogue.slotReuse.constantCounterOnly, true);
  assert.equal(catalogue.slotReuse.testCounterRemovedBeforeConversion, true);
  assert.deepEqual(catalogue.slotReuse.counts, { addedArticles: 24, removedArticles: 24 });
  // The earlier generic validator checks media, packets, exact all-tree peak and
  // adverse recovery. Its build-comparison input permits ONLY the separately
  // pinned/served-verified app difference, not worker or native changes.
  const comparison = { ...previousBuild, assets: previousBuild.assets.map(row => row.role === "application" ? app : row) };
  const result = inspectWarmCacheFailure(terminal, report, previousReport, build, comparison);
  return { ...result, slotReuse: catalogue.slotReuse, all405RoutesRetained: true, slotReuseSufficient: false,
    unavailableSamplesByPhase: report.nativeMemory.phases.filter(row => row.unavailableSamples).map(({ phase, unavailableSamples }) => ({ phase, unavailableSamples })),
    nextAction: "Do not retry slot reuse, CSS, caching or full original unchanged. Capture bounded worker/V8/Wasm compilation and allocation evidence at the repeated input2162688/output748166 recovery checkpoint before a specific runtime fix. UI-only renderer/GPU findings do not prove that active conversion allocation callsite." };
}
