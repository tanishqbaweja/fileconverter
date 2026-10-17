import assert from "node:assert/strict";
import { mergeLifecycleProviders } from "./lifecycle-allocation-observation.mjs";
export function inspectCatalogueScrollDiagnostic(terminal, report) {
  assert.equal(terminal.status, "failed-not-accepted"); assert.deepEqual(terminal.cleanupErrors, []);
  for (const key of ["productionRestored", "wrapperRemoved", "candidateRemoved"]) assert.equal(terminal[key], true);
  assert.equal(report.status, "failed-catalogue-scroll-policy-diagnostic");
  assert.ok(report.failure.message.startsWith("Changing only scroll animation preserves every visible text and box"));
  assert.equal(report.requestedCompletedConversions, 0); assert.equal(report.requestedSmallCompletedConversions, 0); assert.equal(report.runs.length, 0);
  assert.deepEqual(report.progressProbe.compiledCacheEvents, []); assert.deepEqual(report.forbiddenRequests, []);
  assert.equal(report.blankBaseline.stable, true); assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
  assert.ok(report.startupSettlement.actualMs >= 300000); assert.equal(report.limitMiB, 250);
  for (const key of ["boundedCatalogue", "secondCatalogueNavigation"]) {
    const row = report.progressProbe[key]; assert.equal(row.routeCount, 405); assert.equal(row.pagesVisited, 17);
    assert.equal(row.maxMounted, 24); assert.equal(row.everyOriginalCardIdentical, true); assert.equal(row.everyRegistryIdAvailable, true);
  }
  assert.equal(report.progressProbe.thirdCatalogueNavigation, undefined); assert.equal(report.progressProbe.scrollPolicyComparison, undefined);
  assert.deepEqual(report.progressProbe.navigationTimings.map(row => row.mode), ["default-before", "auto"]);
  const diagnostic = report.progressProbe.catalogueAttribution;
  assert.equal(diagnostic.perturbsMemory, true); assert.equal(diagnostic.noForcedGc, true); assert.equal(diagnostic.acceptanceMetric, false);
  assert.equal(diagnostic.maximumPending, 1); assert.equal(diagnostic.checkpoints.length, 5);
  const points = diagnostic.checkpoints.map(row => {
    assert.equal(row.error, null); assert.equal(row.detached, true); assert.equal(row.state.jobState, "idle"); assert.equal(row.state.metrics, null);
    const providers = mergeLifecycleProviders(row.summary.processes), pageRealm = row.realms.targets.filter(target => target.type === "page"), workerRealm = row.realms.targets.filter(target => target.type === "worker");
    assert.equal(pageRealm.length, 1); assert.equal(workerRealm.length, 1);
    const pages = providers.filter(p => p.allocators["v8/main/heap"]?.size === pageRealm[0].allocatedJSHeapBytes && p.allocators["v8/workers/heap"]?.size === workerRealm[0].allocatedJSHeapBytes);
    assert.equal(pages.length, 1); const page = pages[0], gpu = providers.find(p => p.identity?.type === "gpu-process"); assert.ok(gpu);
    const value = (process, key) => process.allocators[key]?.size ?? null;
    return { phase: row.phase, rendererIdentity: page.identity, gpuIdentity: gpu.identity, state: row.state,
      rendererCompositorBytes: value(page, "cc"), rendererBlinkBytes: value(page, "blink_gc"), workerV8MallocBytes: value(page, "v8/workers/malloc"),
      gpuAllocatorBytes: value(gpu, "gpu"), gpuSkiaBytes: value(gpu, "skia"), summedAllocatorTotal: null };
  });
  assert.ok(points[3].rendererCompositorBytes >= points[1].rendererCompositorBytes, "No observed reduction to justify a conversion retry");
  for (const row of report.nativeMemory.phases.filter(row => !/blank|finally/.test(row.phase))) { assert.ok(row.validSamples > 0); assert.equal(row.unavailableSamples, 0); }
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"]) assert.equal(report.cleanup[key], true);
  return { status: "auto-scroll-not-retained-no-observed-tile-reduction-and-aba-incomplete", points,
    diagnosticPerturbsMemory: true, mediaConversions: 0, publicAcceptance: false, abaCompleted: false,
    autoScrollRetained: false, speedGainProven: false, causalMemoryGainProven: false, repeatUnchanged: false, summedAllocatorTotal: null };
}
