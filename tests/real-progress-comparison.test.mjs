import assert from "node:assert/strict";
import test from "node:test";
import { compareRealProgressDiagnostics } from "../scripts/lib/real-progress-comparison.mjs";
const unitRecord = () => ({ browserVersion: "unit-only", progressProbe: { chromeLauncherSha256: "unit-only", chromeLibrarySha256: "unit-only",
  viewport: { width: 1280, height: 900 }, checkpointOutputBytes: 16777216, maximumConversionMs: 120000,
  checkpointReached: true, afterCancellation: { jobState: "cancelled" },
  performanceBefore: { metrics: ["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration"].map(name => ({ name, value: 1 })) },
  performanceAfter: { metrics: ["TaskDuration", "ScriptDuration", "LayoutDuration", "RecalcStyleDuration"].map(name => ({ name, value: 2 })) } },
  conversionJsReport: { maximumSamplingMs: 90000, forcedGcUsed: false, primaryMemoryAcceptance: false,
    records: [1048576, 8388608, 16777216].map(n => ({ phase: `output-${n}`, status: "captured", state: { jobState: "running", metrics: { inputBytes: n, outputBytes: n, elapsedMs: 1 } },
      summary: { estimatedSelfBytes: n, sourceLocatedSelfBytes: n, sampleCount: 1, nodeCount: 1 } })) } });
test("Comparison unit fixture keeps statistical estimates and page CPU separate from acceptance", () => {
  const before = unitRecord(), after = unitRecord(); after.conversionJsReport.records[2].summary.estimatedSelfBytes = 1;
  const result = compareRealProgressDiagnostics(before, after); assert.equal(result.allocations.length, 3);
  assert.equal(result.pageThreadCpuSeconds.baseline.ScriptDuration, 1); assert.equal(result.conversionSpeedAcceptance, false);
  assert.equal(result.completeChromiumMemoryAcceptance, false); assert.equal(result.nativeAllocationCauseProven, false);
  after.progressProbe.chromeLibrarySha256 = "different"; assert.throws(() => compareRealProgressDiagnostics(before, after));
});
test("Missing actual threshold or CPU samples are not substituted as zero or a pass", () => {
  const before = unitRecord(), after = unitRecord(); after.progressProbe.performanceAfter.metrics.pop();
  assert.throws(() => compareRealProgressDiagnostics(before, after), /unavailable is not zero/);
  const absent = unitRecord(); absent.conversionJsReport.records.pop(); assert.throws(() => compareRealProgressDiagnostics(before, absent));
});
