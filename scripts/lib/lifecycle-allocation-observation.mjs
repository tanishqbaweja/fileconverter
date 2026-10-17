import assert from "node:assert/strict";
export function mergeLifecycleProviders(rows) {
  const merged = new Map();
  for (const row of rows) {
    let result = merged.get(row.pid);
    if (!result) { result = { ...row, allocators: {}, providerRows: 0 }; merged.set(row.pid, result); }
    result.providerRows++;
    if (row.privateFootprintBytes != null) {
      assert.ok(result.privateFootprintBytes == null || result.privateFootprintBytes === row.privateFootprintBytes);
      result.privateFootprintBytes = row.privateFootprintBytes;
    }
    for (const [name, value] of Object.entries(row.allocators)) {
      if (Object.hasOwn(result.allocators, name)) assert.deepEqual(result.allocators[name], value, "Conflicting providers must not silently overwrite");
      result.allocators[name] = value;
    }
  }
  return [...merged.values()];
}
export function inspectLifecycleDiagnostic(terminal, report) {
  assert.equal(terminal.status, "failed-not-accepted"); assert.deepEqual(terminal.cleanupErrors, []);
  for (const key of ["productionRestored", "wrapperRemoved", "candidateRemoved"]) assert.equal(terminal[key], true);
  assert.equal(report.publicAcceptance, false); assert.equal(report.requestedSmallCompletedConversions, 4);
  assert.equal(report.requestedCompletedConversions, 0); assert.equal(report.runs.length, 0);
  assert.equal(report.limitMiB, 250); assert.deepEqual(report.forbiddenRequests, []);
  assert.equal(report.blankBaseline.stable, true);
  assert.ok(report.blankBaseline.privateBytes <= report.startupSettlement.earlyWindow.privateBytes);
  assert.ok(report.startupSettlement.actualMs >= 300000);
  const failure = report.nativeFailureCapture.firstFailure;
  assert.ok(failure.incrementalPrivateMiB > 250); assert.equal(failure.cause, null);
  assert.equal(failure.after.privateBytes, failure.after.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  const renderer = failure.delta.processDeltas.reduce((a, b) => a.deltaPrivateBytes > b.deltaPrivateBytes ? a : b);
  const diagnostic = report.progressProbe.lifecycleAttribution;
  assert.equal(diagnostic.perturbsMemory, true); assert.equal(diagnostic.acceptanceMetric, false);
  assert.equal(diagnostic.maximumPending, 1); assert.equal(diagnostic.noForcedGc, true);
  assert.deepEqual(diagnostic.checkpoints.map(row => row.phase), ["loaded-before-media", "validated-output-1", "validated-output-2", "validated-output-3", "post-write-error-before-recovery"]);
  const points = diagnostic.checkpoints.map(row => {
    assert.equal(row.error, null); assert.equal(row.detached, true); assert.ok(row.rawArchive);
    const providers = mergeLifecycleProviders(row.summary.processes), page = providers.find(p => p.pid === renderer.pid);
    assert.ok(page && page.identity.type === "renderer");
    assert.ok(Math.abs(Date.parse(page.identity.createdAt) - Date.parse(renderer.createdAt)) < 1);
    const gpu = providers.find(p => p.identity?.type === "gpu-process"); assert.ok(gpu);
    const value = (process, key, field = "size") => process.allocators[key]?.[field] ?? null;
    return { phase: row.phase, rendererIdentity: page.identity, providerRows: page.providerRows,
      state: row.state.jobState, wasmMemoryBytes: row.state.metrics?.wasmMemoryBytes ?? null,
      rendererV8Bytes: value(page, "v8"), mainV8MallocBytes: value(page, "v8/main/malloc"),
      workerV8MallocBytes: value(page, "v8/workers/malloc"), workerV8HeapBytes: value(page, "v8/workers/heap"),
      rendererMallocBytes: value(page, "malloc"), rendererCompositorBytes: value(page, "cc"),
      gpuPrivateBytes: gpu.identity.privateBytes, gpuSkiaBytes: value(gpu, "skia"),
      gpuAllocatorBytes: value(gpu, "gpu"), summedAllocatorTotal: null };
  });
  const control = report.progressProbe.successfulSaveControl;
  assert.equal(control.successfulFixtureValidations, 3); assert.equal(control.provenance.validationAssertionsChanged, false);
  const outputs = control.rows.filter(row => row.container === "mp4" && row.status === "passed" && row.sourceCodec === "hevc");
  assert.equal(outputs.length, 3);
  for (const row of outputs) {
    assert.equal(row.outputSha256, "8b0d4370068bfa723f7e3a5f11e15369b138fa5bd4415f7a4d7f0b85b59be35c");
    assert.equal(row.outputBytes, 2245626); assert.equal(Number(row.frames), 96); assert.equal(row.ssim, 0.983095);
  }
  assert.equal(control.rows.filter(row => row.kind === "direct-write-failure" && row.status === "passed").length, 1);
  assert.equal(report.quiescedBudgetCapture.cancellation.terminalState, "cancelled");
  assert.equal(report.quiescedBudgetCapture.oldWorkerCloseObserved, true);
  const phase = report.nativeMemory.phases.find(row => row.phase === failure.phase);
  assert.equal(phase.unavailableSamples, 0);
  const peak = Math.max(phase.peak[3], ...report.samples.filter(row => row.phase === phase.phase && row.privateBytes != null).map(row => row.privateBytes));
  return { status: "five-lifecycle-dumps-narrow-idle-retention-and-rendering-growth-not-peak-allocation-cause",
    points, firstFailure: failure, instrumentedPeakPrivateBytes: peak,
    instrumentedIncrementalPrivateMiB: (peak - report.blankBaseline.privateBytes) / 1048576,
    conversionValidSamples: phase.validSamples, conversionUnavailableSamples: phase.unavailableSamples,
    unavailableSamplesByPhase: report.nativeMemory.phases.filter(row => row.unavailableSamples).map(row => ({ phase: row.phase, unavailableSamples: row.unavailableSamples })),
    completedSmallOutputs: 3, completedOriginalConversions: 0, completeRecoveryValidated: false,
    allocationCauseProven: false, diagnosticPerturbsMemory: true, speedGainProven: false,
    publicAcceptance: false, fullOriginalAcceptance: false, summedAllocatorTotal: null };
}
