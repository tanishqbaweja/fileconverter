import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareH264Speed } from "../scripts/lib/h264-speed-comparison.mjs";
const e = JSON.parse(await readFile(new URL("../evidence/h264-library-lto-comparison-2026-10-04.json", import.meta.url)));
test("whole-library LTO keeps genuine output identical but is rejected for lack of speed gain", () => {
  const [before, after] = e.reports.map((entry) => entry.report);
  assert.deepEqual(compareH264Speed(before, after), e.comparison);
  assert.equal(e.status, "library-lto-not-accepted");
  assert.equal(e.comparison.allPrivateGatesPassed, true);
  assert.equal(e.comparison.privateOptimizationCandidatePassed, false);
  assert.equal(e.comparison.publicAcceptance, false);
  assert.ok(e.comparison.measuredSpeedupFraction < -0.05);
  for (const group of [e.comparison.before, e.comparison.after]) {
    assert.equal(group.jobs.length, 3);
    assert.ok(group.jobs.every((job) => job.outputSha256 === "a77bd1fb023a1a3072966d74f173c0c6010eccea689e67b346e29baca3c3a636"));
  }
  assert.ok(e.build.openh264LtoCompileCommands > 10);
  assert.equal(e.build.ffmpegConfigureUsesLto, true);
  assert.equal(e.build.remainingRemoteArtifacts, 0);
});
test("LTO evidence retains full-tree formula, as-executed source binding and honest cleanup limits", async () => {
  for (const entry of e.reports) {
    const r = entry.report;
    assert.equal(r.primaryLimitMiB, 250);
    assert.equal(r.actualWasmMemoryLimits[0].maximumPages, 512);
    for (const run of r.runs) {
      const available = r.samples.filter((sample) => [`pre-conversion-${run.run}`, `conversion-${run.run}`].includes(sample.phase) && sample.privateBytes !== null);
      const peak = Math.max(...available.map((sample) => sample.privateBytes));
      assert.equal(peak, run.peakPrivateBytes);
      assert.equal(run.incrementalPrivateMiB, (peak - r.blankBaseline.privateBytes) / 1048576);
      assert.ok(run.incrementalPrivateMiB <= 250);
    }
    assert.deepEqual(r.forbiddenRequests, []);
    assert.equal(r.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved, true);
  }
  for (const [file, expected] of Object.entries(e.currentSources)) {
    const actual = createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex");
    assert.equal(actual, expected, file);
  }
  assert.equal(e.cleanupAfterComparison.retainedConvertedMediaBytes, 0);
  assert.match(e.cleanupAfterComparison.rejectedStaticToolDeletion, /blocked.*No other deletion mechanism/);
});
