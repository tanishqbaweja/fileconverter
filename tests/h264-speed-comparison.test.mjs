import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { compareH264Speed } from "../scripts/lib/h264-speed-comparison.mjs";
const e = JSON.parse(await readFile(new URL("../evidence/h264-dimension-fix-validation-2026-10-04.json", import.meta.url)));

function report(lto, time) {
  return {
    browserVersion: "same", inputMode: "byob", sourceHashes: { harness: "same" },
    asBuiltManifest: { ...e.dimension.report.asBuiltManifest, artifacts: { "within-h264.wasm": lto ? "new" : "old" }, libraryLinkTimeOptimization: lto },
    source: { bytes: 105000218, sha256: "938eb61229f60a434cc3fede71829e96c30a1d42a64a468d7efc2c7a43622839", audioPacketHashes: ["one", "two"] },
    status: "passed-private-720p-gate", failure: null, forbiddenRequests: [],
    cleanup: { repositoryLocalFixtureOutputsProfileAndTempRemoved: true, generatedDistRestored: true },
    runs: [1, 2, 3].map((run) => ({ run, incrementalPrivateMiB: 200,
      state: { metrics: { elapsedMs: time + run, maxReadChunkBytes: 262144, maxWriteChunkBytes: 262144,
        peakQueuedBytes: 262144, peakPendingOperations: 1, pendingOperations: 0, queuedBytes: 0 } },
      independentValidation: { fullDecodePassed: true, maximumFrameTimeErrorSeconds: 0, ordinalSsim: 0.99,
        outputFrameTimes: Array(1800).fill(0), audioPacketHashes: ["one", "two"], outputSha256: "output" },
      cleanup: { opfsRemainingEntries: [], deltaFromLoadedMiB: 0 },
    })),
  };
}
test("faster failed-memory H264 candidate is diagnostic only, never accepted", () => {
  const baseline = report(false, 30000), candidate = report(true, 24000);
  candidate.status = "failed"; candidate.runs[2].incrementalPrivateMiB = 251;
  const result = compareH264Speed(baseline, candidate);
  assert.ok(result.measuredSpeedupFraction > 0.19);
  assert.equal(result.privateOptimizationCandidatePassed, false);
  assert.equal(result.publicAcceptance, false);
});
test("H264 speed comparison requires identical source, settings, harness and three correct jobs", () => {
  const baseline = report(false, 30000), candidate = report(true, 24000);
  assert.equal(compareH264Speed(baseline, candidate).privateOptimizationCandidatePassed, true);
  candidate.runs.pop();
  assert.equal(compareH264Speed(baseline, candidate).measuredSpeedupFraction, null);
  candidate.sourceHashes.harness = "different";
  assert.throws(() => compareH264Speed(baseline, candidate), /Same executed harness/);
});
test("missing memory or manifest evidence cannot become a passing speed optimization", () => {
  const baseline = report(false, 30000), candidate = report(true, 24000);
  candidate.runs[0].incrementalPrivateMiB = null;
  assert.equal(compareH264Speed(baseline, candidate).privateOptimizationCandidatePassed, false);
  delete baseline.asBuiltManifest.codecThreads;
  assert.throws(() => compareH264Speed(baseline, candidate), /Missing manifest field/);
});
