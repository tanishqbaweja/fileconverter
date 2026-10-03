import assert from "node:assert/strict";

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
export function compareH264Speed(baseline, candidate) {
  assert.equal(baseline.browserVersion, candidate.browserVersion, "Same installed browser");
  assert.equal(baseline.inputMode, candidate.inputMode, "Same production input adapter");
  assert.equal(baseline.source.bytes, 105000218);
  assert.equal(baseline.source.sha256, "938eb61229f60a434cc3fede71829e96c30a1d42a64a468d7efc2c7a43622839");
  assert.equal(candidate.source.bytes, baseline.source.bytes);
  assert.equal(candidate.source.sha256, baseline.source.sha256, "Identical genuine fixture bytes");
  assert.deepEqual(candidate.sourceHashes, baseline.sourceHashes, "Same executed harness, AVIO, native settings and compiler recipe source");
  const fields = ["candidateKernelSha256", "currentAvioWrapperSourceSha256", "generatedWrapperSourceSha256",
    "ffmpegSourceSha256", "openh264Commit", "openh264SourceSha256", "emscriptenVersion", "forceIntraBridgeSha256",
    "forceIntraPatchSha256", "matroskaNoCuesPatchSha256", "initialWasmMemoryBytes", "maximumWasmMemoryBytes",
    "allowMemoryGrowth", "codecThreads", "pthreadPoolSize", "avioInputBufferBytes", "avioOutputBufferBytes",
    "enabledDecoders", "enabledEncoders", "enabledDemuxers", "enabledMuxers", "enabledParsers", "enabledBitstreamFilters"];
  for (const field of fields) {
    assert.notEqual(baseline.asBuiltManifest[field], undefined, `Missing manifest field: ${field}`);
    assert.deepEqual(candidate.asBuiltManifest[field], baseline.asBuiltManifest[field], field);
  }
  assert.equal(baseline.asBuiltManifest.initialWasmMemoryBytes, 33554432);
  assert.equal(baseline.asBuiltManifest.maximumWasmMemoryBytes, 33554432);
  assert.equal(baseline.asBuiltManifest.allowMemoryGrowth, false);
  assert.notEqual(candidate.asBuiltManifest.artifacts["within-h264.wasm"], baseline.asBuiltManifest.artifacts["within-h264.wasm"], "Must actually compare different binaries");
  assert.ok(!baseline.asBuiltManifest.libraryLinkTimeOptimization);
  assert.equal(candidate.asBuiltManifest.libraryLinkTimeOptimization, true);
  const summarize = (report) => ({
    status: report.status,
    failure: report.failure,
    jobs: report.runs.map((run) => ({
      run: run.run, jobElapsedMs: run.state?.metrics?.elapsedMs ?? null,
      incrementalPrivateMiB: run.incrementalPrivateMiB,
      correctnessPassed: Boolean(run.independentValidation?.fullDecodePassed &&
        run.independentValidation.maximumFrameTimeErrorSeconds <= 0.001 && run.independentValidation.ordinalSsim >= 0.98 &&
        run.independentValidation.outputFrameTimes.length === 1800 &&
        JSON.stringify(run.independentValidation.audioPacketHashes) === JSON.stringify(report.source.audioPacketHashes)),
      cleanupPassed: Boolean(run.cleanup?.opfsRemainingEntries?.length === 0 && run.cleanup.deltaFromLoadedMiB <= 96),
      boundsPassed: Boolean(run.state?.metrics?.maxReadChunkBytes <= 262144 && run.state.metrics.maxWriteChunkBytes <= 262144 &&
        run.state.metrics.peakQueuedBytes <= 262144 && run.state.metrics.peakPendingOperations <= 1 &&
        run.state.metrics.pendingOperations === 0 && run.state.metrics.queuedBytes === 0),
      outputSha256: run.independentValidation?.outputSha256 ?? null,
      ordinalSsim: run.independentValidation?.ordinalSsim ?? null,
    })),
    privacyPassed: report.forbiddenRequests.length === 0,
    disposableCleanupPassed: report.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved === true && report.cleanup.generatedDistRestored === true,
  });
  const before = summarize(baseline), after = summarize(candidate);
  const repeatableTimings = [before, after].every((group) => group.jobs.length === 3 &&
    group.jobs.every((job) => job.correctnessPassed && job.jobElapsedMs > 0 && Number.isFinite(job.jobElapsedMs)));
  const allPrivateGates = [before, after].every((group) => group.status === "passed-private-720p-gate" &&
    group.privacyPassed && group.disposableCleanupPassed && group.jobs.length === 3 &&
    group.jobs.every((job) => job.correctnessPassed && job.cleanupPassed && job.boundsPassed &&
      Number.isFinite(job.incrementalPrivateMiB) && job.incrementalPrivateMiB <= 250));
  const baselineMedianMs = repeatableTimings ? median(before.jobs.map((job) => job.jobElapsedMs)) : null;
  const candidateMedianMs = repeatableTimings ? median(after.jobs.map((job) => job.jobElapsedMs)) : null;
  const measuredSpeedupFraction = repeatableTimings ? 1 - candidateMedianMs / baselineMedianMs : null;
  return {
    scope: "Same 60s 720p input/settings; three jobs in one clean browser per binary. Not clean-session repeats, direct-output, multi-gigabyte, legal or public-profile certification.",
    before, after, repeatableTimings, baselineMedianMs, candidateMedianMs, measuredSpeedupFraction,
    allPrivateGatesPassed: allPrivateGates,
    privateOptimizationCandidatePassed: allPrivateGates && repeatableTimings && measuredSpeedupFraction >= 0.05,
    publicAcceptance: false,
  };
}
