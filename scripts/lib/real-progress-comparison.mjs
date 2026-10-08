// Instrumented diagnostic estimates, never a conversion-speed or memory certificate.
import assert from "node:assert/strict";
const thresholds = [1048576, 8388608, 16777216];
export function compareRealProgressDiagnostics(baseline, candidate) {
  assert.equal(baseline.browserVersion, candidate.browserVersion);
  for (const key of ["chromeLauncherSha256", "chromeLibrarySha256", "viewport", "checkpointOutputBytes", "maximumConversionMs"])
    assert.deepEqual(baseline.progressProbe[key], candidate.progressProbe[key], key);
  for (const report of [baseline, candidate]) {
    assert.equal(report.progressProbe.checkpointReached, true);
    assert.equal(report.progressProbe.afterCancellation.jobState, "cancelled");
    assert.equal(report.conversionJsReport.maximumSamplingMs, 90000);
    assert.equal(report.conversionJsReport.forcedGcUsed, false);
    assert.equal(report.conversionJsReport.primaryMemoryAcceptance, false);
  }
  const allocations = thresholds.map(threshold => {
    const values = [baseline, candidate].map(report => {
      const record = report.conversionJsReport.records.find(row => row.phase === `output-${threshold}`);
      assert.equal(record?.status, "captured"); assert.equal(record.state.jobState, "running");
      assert.ok(record.state.metrics.outputBytes >= threshold);
      assert.ok(Number.isSafeInteger(record.summary.estimatedSelfBytes) && record.summary.estimatedSelfBytes >= 0);
      return { observedInputBytes: record.state.metrics.inputBytes, observedOutputBytes: record.state.metrics.outputBytes,
        elapsedMs: record.state.metrics.elapsedMs, estimatedAllocatedBytes: record.summary.estimatedSelfBytes,
        sourceLocatedEstimatedBytes: record.summary.sourceLocatedSelfBytes, sampleCount: record.summary.sampleCount,
        nodeCount: record.summary.nodeCount };
    });
    return { thresholdOutputBytes: threshold, baseline: values[0], candidate: values[1],
      estimatedBytesDifference: values[1].estimatedAllocatedBytes - values[0].estimatedAllocatedBytes,
      observedOutputBytesDifference: values[1].observedOutputBytes - values[0].observedOutputBytes,
      caveat: "Random statistical cumulative allocation estimates; threshold polling can overshoot; not exact live/native bytes or equal-work speed proof" };
  });
  const performance = report => {
    const before = report.progressProbe.performanceBefore.metrics, after = report.progressProbe.performanceAfter.metrics;
    return Object.fromEntries(["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration"].map(name => {
      const a = before.find(row => row.name === name)?.value, b = after.find(row => row.name === name)?.value;
      assert.ok(Number.isFinite(a) && Number.isFinite(b) && b >= a, `${name} unavailable is not zero`);
      return [name, b - a];
    }));
  };
  return { browserVersion: baseline.browserVersion, matchedBrowserHashes: true, matchedViewport: baseline.progressProbe.viewport,
    allocations, pageThreadCpuSeconds: { baseline: performance(baseline), candidate: performance(candidate),
      scope: "CDP threadTicks page task/script/layout/style only; excludes workers/whole conversion CPU; sampling/threshold overshoot perturbs timing" },
    samplingIntervalBytes: 65536, forcedGcUsed: false, nativeAllocationCauseProven: false,
    completeOutputIndependentlyValidated: false, completeOriginalConversions: 0,
    conversionSpeedAcceptance: false, completeChromiumMemoryAcceptance: false, publicAcceptance: false };
}
