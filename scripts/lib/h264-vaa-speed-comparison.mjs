import assert from "node:assert/strict";

const MiB = 1024 ** 2;
const outputHash = "a77bd1fb023a1a3072966d74f173c0c6010eccea689e67b346e29baca3c3a636";
const formula = "peak complete Chromium process-tree private memory during conversion - stable clean blank-Chromium process-tree private memory";
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function compareH264VaaSpeed(baseline, candidate, arithmeticProof) {
  assert.equal(baseline.browserVersion, candidate.browserVersion, "Same installed browser required");
  assert.equal(baseline.inputMode, candidate.inputMode, "Same production input adapter required");
  assert.deepEqual(baseline.sourceHashes, candidate.sourceHashes, "Same executed harness, native kernel and current recipe source required");
  for (const report of [baseline, candidate]) {
    assert.equal(report.cpuEnabled, false, "Profiler must be disabled for speed A/B");
    assert.equal(report.requestedRunCount, 3);
    assert.equal(report.source.bytes, 105000218);
    assert.equal(report.source.sha256, "938eb61229f60a434cc3fede71829e96c30a1d42a64a468d7efc2c7a43622839");
    assert.equal(report.formula, formula);
    assert.equal(report.primaryLimitMiB, 250);
    assert.ok(report.blankBaseline?.stable && report.blankBaseline.sampleCount >= 5 && report.blankBaseline.minimumElapsedMs >= 8000);
    assert.ok(report.blankBaseline.privateBytes > 0 && Number.isFinite(report.blankBaseline.privateBytes));
    assert.deepEqual(report.actualWasmMemoryLimits.map(({ initialPages, maximumPages, shared }) => ({ initialPages, maximumPages, shared })),
      [{ initialPages: 512, maximumPages: 512, shared: true }]);
    assert.ok(!report.asBuiltManifest.libraryLinkTimeOptimization, "Do not combine the rejected LTO experiment with SIMD");
  }
  const fields = ["candidateKernelSha256", "currentAvioWrapperSourceSha256", "generatedWrapperSourceSha256",
    "ffmpegSourceSha256", "openh264Commit", "openh264SourceSha256", "emscriptenVersion", "forceIntraBridgeSha256",
    "forceIntraPatchSha256", "matroskaNoCuesPatchSha256", "initialWasmMemoryBytes", "maximumWasmMemoryBytes",
    "allowMemoryGrowth", "codecThreads", "pthreadPoolSize", "avioInputBufferBytes", "avioOutputBufferBytes",
    "enabledDecoders", "enabledEncoders", "enabledDemuxers", "enabledMuxers", "enabledParsers", "enabledBitstreamFilters",
    "encoderFrameSkipping", "normalizesSourceTiming", "maximumStreams", "maximumChapters", "maximumAttachmentBytes"];
  for (const field of fields) {
    assert.notEqual(baseline.asBuiltManifest[field], undefined, `Missing manifest field: ${field}`);
    assert.deepEqual(candidate.asBuiltManifest[field], baseline.asBuiltManifest[field], `Same settings required: ${field}`);
  }
  assert.equal(baseline.asBuiltManifest.initialWasmMemoryBytes, 33554432);
  assert.equal(baseline.asBuiltManifest.maximumWasmMemoryBytes, 33554432);
  assert.equal(baseline.asBuiltManifest.allowMemoryGrowth, false);
  assert.equal(baseline.asBuiltManifest.codecThreads, 1);
  assert.ok(!baseline.asBuiltManifest.openh264VaaSimd);
  assert.equal(candidate.asBuiltManifest.openh264VaaSimd, true);
  assert.notEqual(baseline.asBuiltManifest.artifacts["within-h264.wasm"], candidate.asBuiltManifest.artifacts["within-h264.wasm"], "Different actual Wasm binaries required");
  const proven = arithmeticProof.attempts.find((attempt) => attempt.run.conclusion === "success");
  assert.equal(proven.report.totalCases, 132101);
  assert.equal(candidate.asBuiltManifest.openh264VaaSimdProvenance.helperSha256,
    proven.report.sourceHashes["media/ffmpeg/openh264-vaa-simd.h"]);
  assert.equal(candidate.asBuiltManifest.openh264VaaSimdProvenance.upstreamSourceSha256, proven.report.upstream.sha256);
  const summarize = (report) => ({
    status: report.status, failure: report.failure,
    privacyPassed: report.forbiddenRequests.length === 0,
    disposableCleanupPassed: report.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved === true && report.cleanup.generatedDistRestored === true,
    jobs: report.runs.map((run) => {
      const metrics = run.state?.metrics, validation = run.independentValidation;
      const samples = report.samples.filter((sample) => [`pre-conversion-${run.run}`, `conversion-${run.run}`].includes(sample.phase) &&
        sample.privateBytes != null && sample.privateBytes > 0 && Number.isFinite(sample.privateBytes));
      const peak = samples.length ? Math.max(...samples.map((sample) => sample.privateBytes)) : null;
      const increment = peak == null ? null : (peak - report.blankBaseline.privateBytes) / MiB;
      const sourceTimes = report.source.frameTimes, outputTimes = validation?.outputFrameTimes;
      const sourceProbe = report.source.probe, probe = validation?.outputProbe;
      const video = probe?.streams?.find((stream) => stream.codec_type === "video");
      const audio = probe?.streams?.filter((stream) => stream.codec_type === "audio");
      const correctnessPassed = Boolean(run.state?.jobState === "complete" && validation?.fullDecodePassed === true &&
        validation.outputSha256 === outputHash && validation.outputBytes === 19137689 &&
        sourceTimes?.length === 1800 && outputTimes?.length === 1800 &&
        outputTimes.every((time, i) => Number.isFinite(time) && Math.abs(time - sourceTimes[i]) <= 0.001) &&
        validation.maximumFrameTimeErrorSeconds <= 0.001 && validation.ordinalSsim >= 0.98 &&
        equal(validation.audioPacketHashes, report.source.audioPacketHashes) &&
        video?.codec_name === "h264" && video.width === 1280 && video.height === 720 && Number(video.nb_read_frames) === 1800 &&
        equal(audio?.map((stream) => [stream.codec_name, stream.tags?.language]), [["aac", "eng"], ["aac", "hin"]]) &&
        probe.format.tags.title === sourceProbe.format.tags.title &&
        probe.chapters.length === 1 && probe.chapters[0].tags.title === sourceProbe.chapters[0].tags.title &&
        Math.abs(Number(probe.format.duration) - Number(sourceProbe.format.duration)) < 0.06);
      return {
        run: run.run, jobElapsedMs: metrics?.elapsedMs ?? null, reportedIncrementalPrivateMiB: run.incrementalPrivateMiB,
        recalculatedIncrementalPrivateMiB: increment,
        memoryPassed: Number.isFinite(increment) && increment <= 250 && samples.length > 2 &&
          peak === run.peakPrivateBytes && increment === run.incrementalPrivateMiB,
        correctnessPassed,
        boundsPassed: Boolean(metrics?.peakWasmMemoryBytes === 33554432 && metrics.maxReadChunkBytes <= 262144 &&
          metrics.maxWriteChunkBytes <= 262144 && metrics.peakQueuedBytes <= 262144 && metrics.peakPendingOperations <= 1 &&
          metrics.queuedBytes === 0 && metrics.pendingOperations === 0),
        cleanupPassed: Boolean(run.cleanup?.opfsRemainingEntries?.length === 0 && run.cleanup.deltaFromLoadedMiB <= 96),
        outputSha256: validation?.outputSha256 ?? null, ordinalSsim: validation?.ordinalSsim ?? null,
      };
    }),
  });
  const before = summarize(baseline), after = summarize(candidate);
  const repeatableTimings = [before, after].every((group) => group.jobs.length === 3 &&
    group.jobs.every((job) => job.correctnessPassed && Number.isFinite(job.jobElapsedMs) && job.jobElapsedMs > 0));
  const allPrivateGatesPassed = [before, after].every((group) => group.status === "passed-private-720p-gate" &&
    group.privacyPassed && group.disposableCleanupPassed && group.jobs.length === 3 &&
    group.jobs.every((job) => job.correctnessPassed && job.memoryPassed && job.boundsPassed && job.cleanupPassed));
  const baselineMedianMs = repeatableTimings ? median(before.jobs.map((job) => job.jobElapsedMs)) : null;
  const candidateMedianMs = repeatableTimings ? median(after.jobs.map((job) => job.jobElapsedMs)) : null;
  const measuredSpeedupFraction = repeatableTimings ? 1 - candidateMedianMs / baselineMedianMs : null;
  return {
    scope: "Three identical 60s/720p genuine browser conversions per binary; private SIMD trial only, not clean-session repeats/direct-output/scaling/legal/public certification",
    before, after, repeatableTimings, allPrivateGatesPassed, baselineMedianMs, candidateMedianMs, measuredSpeedupFraction,
    privateOptimizationCandidatePassed: allPrivateGatesPassed && repeatableTimings && measuredSpeedupFraction >= 0.05,
    publicAcceptance: false,
  };
}
