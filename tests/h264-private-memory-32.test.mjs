import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const evidence = JSON.parse(await readFile(path.join(root, "evidence/h264-private-memory-32-2026-10-04.json"), "utf8"));
test("fixed 32 MiB H264 preserves content but fails the unchanged three-run full-process gate", () => {
  const report = evidence.report;
  assert.equal(report.status, "failed");
  assert.equal(evidence.publicAcceptance, false);
  assert.equal(report.asBuiltManifest.maximumWasmMemoryBytes, 33554432);
  assert.deepEqual(report.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.deepEqual(report.runs.map((run) => run.incrementalPrivateMiB), [239, 192.5234375, 423.9453125]);
  for (const run of report.runs) {
    assert.equal(run.independentValidation.outputSha256, "a77bd1fb023a1a3072966d74f173c0c6010eccea689e67b346e29baca3c3a636");
    assert.equal(run.independentValidation.maximumFrameTimeErrorSeconds, 0);
    assert.ok(run.independentValidation.ordinalSsim >= 0.98);
    assert.equal(run.state.metrics.peakWasmMemoryBytes, 33554432);
    assert.deepEqual(run.cleanup.opfsRemainingEntries, []);
  }
  const peak = report.samples.filter((sample) => sample.phase === "conversion-3" && sample.privateBytes != null)
    .reduce((left, right) => left.privateBytes > right.privateBytes ? left : right);
  assert.ok(peak.processes.some((process) => process.type === "utility" && process.privateBytes > 249 * 1024 ** 2));
  assert.ok(peak.cdpIsolateHeaps.targets.some((target) => target.type === "worker" && target.usedJSHeapBytes > 0));
  assert.equal(report.primaryLimitMiB, 250);
  assert.equal(evidence.hostedBuild.remoteRemainingArtifacts, 0);
  assert.equal(report.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved, true);
});
