import assert from "node:assert/strict";
import { CATALOGUE_CSS } from "./bounded-catalogue-candidate.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";

export function inspectBoundedCatalogueFailure(terminal, report, previousReport, build, previousBuild) {
  assert.equal(terminal.status, "failed-not-accepted"); assert.deepEqual(terminal.cleanupErrors, []);
  for (const key of ["productionRestored", "wrapperRemoved", "candidateRemoved"]) assert.equal(terminal[key], true);
  assert.equal(build.originalJsxAndControlsPreserved, false); assert.equal(build.conversionControlsPreserved, true);
  assert.equal(build.maximumMountedCatalogueCards, 24); assert.equal(build.catalogueCardsPreserved, true);
  for (const key of ["nativeWasmChanged", "codecParametersChanged", "progressSamplingChanged", "normalSourcesEdited"]) assert.equal(build[key], false);
  const app = build.assets.find(row => row.role === "application");
  assert.equal(app.bytes, 324962); assert.equal(app.sha256, "6b4b7d60faad1b9051b05acefdbb7a6ea2933646e13a79d1986c3b71f19166e7");
  const binding = ({ url, bytes, sha256 }) => ({ url, bytes, sha256 });
  assert.deepEqual(report.progressProbe.actualServedAsset, binding(app));
  assert.deepEqual(build.assets.filter(row => row.role !== "application").map(binding), previousBuild.assets.filter(row => row.role !== "application").map(binding));
  assert.equal(build.stylesheet.sha256, previousBuild.stylesheet.sha256);
  assert.equal(report.cssCandidate.css, previousReport.cssCandidate.css + CATALOGUE_CSS);
  assert.equal(report.progressProbe.expectedStylesheet.matrixCssSha256, sha(report.cssCandidate.css));
  const catalogue = report.progressProbe.boundedCatalogue;
  assert.equal(catalogue.routeCount, 405); assert.equal(catalogue.pagesVisited, 17);
  assert.equal(catalogue.maxMounted, 24); assert.equal(catalogue.finalMounted, 24);
  for (const key of ["everyOriginalCardIdentical", "everyRegistryIdAvailable", "searchEmptyAndResetVerified", "emptyHydrationCommentsIgnored"]) assert.equal(catalogue[key], true);
  assert.equal(catalogue.otherHtmlNormalization, false);
  assert.deepEqual(report.manifest, previousReport.manifest); assert.deepEqual(report.actualWasmMemoryLimits, previousReport.actualWasmMemoryLimits);
  assert.equal(report.limitMiB, 250); assert.deepEqual(report.forbiddenRequests, []);
  assert.equal(report.blankBaseline.stable, true); assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
  assert.ok(report.startupSettlement.actualMs >= 300000);
  assert.equal(report.runs.length, 0); assert.equal(report.requestedCompletedConversions, 0); assert.equal(report.requestedSmallCompletedConversions, 6);
  const control = report.progressProbe.successfulSaveControl; assert.equal(control.successfulFixtureValidations, 0);
  assert.equal(control.rows.filter(row => row.container === "mp4" && row.status === "passed").length, 0);
  assert.equal(control.provenance.validationAssertionsChanged, false); assert.equal(control.provenance.noPageReloadBetweenJobs, true);
  const failure = report.nativeFailureCapture.firstFailure; assert.equal(failure.phase, "conversion-completed-save-control"); assert.equal(failure.cause, null);
  const phase = report.nativeMemory.phases.find(row => row.phase === failure.phase);
  assert.equal(phase.unavailableSamples, 0); assert.ok(phase.validSamples > 0);
  assert.equal(failure.after.privateBytes, failure.after.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  const cim = report.samples.filter(row => row.phase === failure.phase && row.privateBytes != null);
  const peak = Math.max(phase.peak[3], ...cim.map(row => row.privateBytes));
  assert.ok((peak - report.blankBaseline.privateBytes) / 1048576 > 250);
  const metrics = report.quiescedBudgetCapture.stateBefore.metrics;
  assert.equal(metrics.wasmMemoryBytes, 50331648); assert.equal(metrics.maxReadChunkBytes, 65536);
  assert.ok(metrics.peakQueuedBytes <= 65536 && metrics.peakPendingOperations <= 1);
  assert.equal(report.quiescedBudgetCapture.cancellation.terminalState, "cancelled"); assert.equal(report.quiescedBudgetCapture.oldWorkerCloseObserved, true);
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true);
  assert.equal(report.cleanup.completedSaveFixture.removed, true);
  return { status: "all405-routes-preserved-but-first-conversion-over-budget-after-catalogue-navigation",
    completedSmallOutputs: 0, completedOriginalConversions: 0, requestedSmallOutputs: 6,
    firstNativeBreachMiB: failure.incrementalPrivateMiB, peakPrivateBytes: peak,
    peakIncrementalPrivateMiB: (peak - report.blankBaseline.privateBytes) / 1048576,
    blankPrivateBytes: report.blankBaseline.privateBytes, loadedPrivateBytes: report.loadedIdle.privateBytes,
    conversionValidSamples: phase.validSamples, conversionUnavailableSamples: phase.unavailableSamples,
    firstFailure: failure, metricsBeforeAutomaticCancellation: metrics,
    allocationCauseProven: false, speedGainProven: false, repeatUnchanged: false,
    catalogue, publicAcceptance: false, fullOriginalAcceptance: false };
}
