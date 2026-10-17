import assert from "node:assert/strict";
import { mergeLifecycleProviders } from "./lifecycle-allocation-observation.mjs";
export function inspectCatalogueNavigation(terminal, report) {
  assert.equal(terminal.status, "catalogue-navigation-diagnostic-finished-pending-audit-not-acceptance");
  assert.deepEqual(terminal.cleanupErrors, []); assert.equal(terminal.failure, null);
  for (const key of ["productionRestored", "wrapperRemoved", "candidateRemoved"]) assert.equal(terminal[key], true);
  assert.equal(report.status, "catalogue-navigation-allocation-diagnostic-not-acceptance");
  assert.equal(report.requestedSmallCompletedConversions, 0); assert.equal(report.requestedCompletedConversions, 0); assert.equal(report.runs.length, 0);
  assert.equal(report.progressProbe.successfulSaveControl.successfulFixtureValidations, 0);
  assert.deepEqual(report.progressProbe.compiledCacheEvents, []); assert.deepEqual(report.forbiddenRequests, []);
  assert.equal(report.blankBaseline.stable, true); assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
  assert.ok(report.startupSettlement.actualMs >= 300000); assert.equal(report.limitMiB, 250);
  for (const key of ["boundedCatalogue", "secondCatalogueNavigation"]) {
    const row = report.progressProbe[key]; assert.equal(row.routeCount, 405); assert.equal(row.pagesVisited, 17);
    assert.equal(row.maxMounted, 24); assert.equal(row.everyOriginalCardIdentical, true); assert.equal(row.everyRegistryIdAvailable, true);
  }
  assert.ok(report.progressProbe.navigationObservationMs >= 30000);
  const diagnostic = report.progressProbe.catalogueAttribution;
  assert.equal(diagnostic.perturbsMemory, true); assert.equal(diagnostic.noForcedGc, true); assert.equal(diagnostic.acceptanceMetric, false);
  assert.equal(diagnostic.maximumPending, 1); assert.equal(diagnostic.queuedRequests, 0);
  assert.deepEqual(diagnostic.checkpoints.map(row => row.phase), ["loaded-before-navigation", "after-first-navigation", "after-first-idle", "after-second-navigation", "after-thirty-second-idle"]);
  const points = diagnostic.checkpoints.map(row => {
    assert.equal(row.error, null); assert.equal(row.detached, true);
    assert.equal(row.state.jobState, "idle"); assert.equal(row.state.metrics, null); assert.equal(row.state.cards, 24);
    const providers = mergeLifecycleProviders(row.summary.processes);
    assert.equal(row.realms.targetsAvailable, true);
    const pageRealm = row.realms.targets.filter(target => target.type === "page"); assert.equal(pageRealm.length, 1);
    const workerRealm = row.realms.targets.filter(target => target.type === "worker"); assert.equal(workerRealm.length, 1);
    const pages = providers.filter(p => p.allocators["v8/main/heap"]?.size === pageRealm[0].allocatedJSHeapBytes &&
      p.allocators["v8/workers/heap"]?.size === workerRealm[0].allocatedJSHeapBytes);
    assert.equal(pages.length, 1, "Bind page PID by exact separately sampled page+worker heap sizes, not generic Renderer name");
    const page = pages[0], gpu = providers.find(p => p.identity?.type === "gpu-process"); assert.ok(gpu);
    const value = (process, key) => process.allocators[key]?.size ?? null;
    return { phase: row.phase, rendererIdentity: page.identity, gpuIdentity: gpu.identity, state: row.state,
      rendererV8Bytes: value(page, "v8"), rendererBlinkBytes: value(page, "blink_gc"), rendererMallocBytes: value(page, "malloc"),
      rendererCompositorBytes: value(page, "cc"), mainV8MallocBytes: value(page, "v8/main/malloc"), workerV8MallocBytes: value(page, "v8/workers/malloc"),
      gpuAllocatorBytes: value(gpu, "gpu"), gpuSkiaBytes: value(gpu, "skia"), gpuMallocBytes: value(gpu, "malloc"), summedAllocatorTotal: null };
  });
  for (const row of points) {
    assert.equal(row.rendererIdentity.pid, points[0].rendererIdentity.pid); assert.equal(row.rendererIdentity.createdAt, points[0].rendererIdentity.createdAt);
    assert.equal(row.gpuIdentity.pid, points[0].gpuIdentity.pid); assert.equal(row.gpuIdentity.createdAt, points[0].gpuIdentity.createdAt);
  }
  const phases = report.nativeMemory.phases.filter(row => !/blank|finally/.test(row.phase));
  assert.ok(phases.length >= 5); for (const row of phases) { assert.ok(row.validSamples > 0); assert.equal(row.unavailableSamples, 0); }
  const uiPeak = Math.max(...phases.map(row => row.peak[3]));
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true);
  return { status: "two-full-catalogue-traversals-show-transient-compositor-and-gpu-resources-not-conversion-acceptance",
    points, uiNativePeakPrivateBytes: uiPeak, instrumentedUiIncrementalPrivateMiB: (uiPeak - report.blankBaseline.privateBytes) / 1048576,
    unavailableUiSamples: 0, diagnosticPerturbsMemory: true, mediaConversions: 0, publicAcceptance: false,
    previousConversionPeakCallsiteProven: false, monotonicRetainedWorkerHeapGrowthSupported: false,
    summedAllocatorTotal: null };
}
