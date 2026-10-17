import assert from "node:assert/strict";
import { inspectSaveHandoffObservation } from "./save-handoff-observation.mjs";

export function inspectMemoizedHandoffCandidate(terminal, report, build, baselineReport, baselineBuild) {
  const result = inspectSaveHandoffObservation(terminal, report, true);
  assert.equal(build.displayTreeMemoization, true); assert.equal(build.progressSamplingChanged, false);
  assert.equal(build.nativeWasmChanged, false); assert.equal(build.codecParametersChanged, false);
  assert.equal(build.copyLoopChanged, false); assert.equal(build.normalSourcesEdited, false);
  const identity = row => ({ role: row.role, url: row.url, bytes: row.bytes, sha256: row.sha256 });
  const workers = rows => rows.filter(row => row.role !== "application").map(identity);
  assert.deepEqual(workers(build.assets), workers(baselineBuild.assets));
  const candidateApp = build.assets.find(row => row.role === "application");
  const served = report.progressProbe.actualServedAsset;
  assert.deepEqual(served, { url: candidateApp.url, bytes: candidateApp.bytes, sha256: candidateApp.sha256 });
  assert.notEqual(served.sha256, baselineReport.progressProbe.actualServedAsset.sha256);
  const stylesheet = row => ({ url: row.url, bytes: row.bytes, sha256: row.sha256 });
  assert.deepEqual(stylesheet(build.stylesheet), stylesheet(baselineBuild.stylesheet));
  assert.deepEqual(report.cssCandidate.staticAssets.map(row => row.afterSha256), baselineReport.cssCandidate.staticAssets.map(row => row.afterSha256));
  assert.deepEqual(report.manifest, baselineReport.manifest);
  assert.deepEqual(report.actualWasmMemoryLimits, baselineReport.actualWasmMemoryLimits);
  const output = value => value.progressProbe.successfulSaveControl.rows.find(row => row.container === "mp4" && row.status === "passed");
  const old = output(baselineReport), next = output(report);
  assert.equal(next.outputSha256, old.outputSha256);
  assert.equal(report.browserVersion, baselineReport.browserVersion);
  assert.deepEqual(report.progressProbe.viewport, baselineReport.progressProbe.viewport);
  return { ...result, status: "display-tree-reuse-rejected-as-current-memory-fix",
    application: identity(candidateApp), workerAssetsUnchanged: true, stylesheetUnchanged: true,
    baselineOriginalBreachMiB: baselineReport.nativeFailureCapture.firstFailure.incrementalPrivateMiB,
    candidateOriginalBreachMiB: result.firstBudgetFailureMiB,
    baselineFixtureElapsedMs: old.metrics.elapsedMs, candidateFixtureElapsedMs: next.metrics.elapsedMs,
    performanceScope: "One small fixture timing per separate browser session; not a controlled speed-win claim or full conversion benchmark",
    memoryFixAccepted: false, speedGainProven: false, nativeAllocationCauseProven: false,
    repeatUnchangedCandidate: false, normalPublicApplicationChanged: false };
}
