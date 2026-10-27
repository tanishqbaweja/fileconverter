import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const json = async file => JSON.parse(await readFile(new URL("../evidence/" + file, import.meta.url), "utf8"));
const actual = await json("2026-10-27-browser-recovery-terminal.json");
test("single recovery handle reaches terminal success with both complete suites, not started cases or skipped jobs", async () => {
  const dispatch = await json("2026-10-27-browser-recovery-dispatch.json");
  assert.equal(actual.runId, dispatch.runId); assert.equal(actual.headSha, dispatch.headSha);
  assert.equal(actual.status, "completed"); assert.equal(actual.conclusion, "success");
  assert.equal(actual.duplicateDispatchUsed, false);
  assert.ok(Date.parse(actual.observedAt) >= Date.parse(dispatch.nextStatusCheckNotBefore));
  assert.deepEqual(actual.jobs.map(row => [row.suite, row.testsPassed]).sort(), [["media-remux", 554], ["streaming-conversions", 238]]);
  assert.equal(actual.totalRecoveredBrowserTestsPassed, actual.jobs.reduce((sum, row) => sum + row.testsPassed, 0));
  for (const row of actual.jobs) {
    assert.equal(row.conclusion, "success"); assert.match(row.summary, new RegExp("^" + row.testsPassed + " passed"));
    assert.match(row.logSha256, /^[a-f0-9]{64}$/); assert.ok(row.logBytes > 100000);
    assert.ok(dispatch.activeJobs.some(job => job.jobId === row.jobId));
  }
});
test("required independent validators remain installed and setup completes in 15/19seconds within unchanged safety budgets", () => {
  assert.deepEqual(Object.keys(actual.requiredValidatorsObserved).sort(), ["Pillow", "ffmpeg", "libarchive-tools", "py7zr"]);
  assert.equal(actual.requiredValidatorsObserved.Pillow, "11.3.0"); assert.equal(actual.requiredValidatorsObserved.py7zr, "1.1.0");
  for (const row of actual.jobs) {
    assert.equal((Date.parse(row.validatorSetupCompletedAt) - Date.parse(row.validatorSetupStartedAt)) / 1000, row.validatorSetupSeconds);
    assert.ok(row.validatorSetupSeconds < 12 * 60);
    assert.ok(Date.parse(row.testsStartedAt) >= Date.parse(row.validatorSetupCompletedAt));
    assert.ok(Date.parse(row.testsCompletedAt) <= Date.parse(row.completedAt));
  }
});
test("earlier cancellation/crash remains separate and successful recovery is not memory/native/release or complete-goal acceptance", async () => {
  const old = await json("2026-10-27-cloudflare-ci-terminal.json");
  assert.equal(old.conclusion, "cancelled");
  assert.equal(actual.previousCancellationAndTargetCrashNotRelabelledSuccess, true);
  assert.equal(actual.verifyAndNativeEngineJobsSkippedNotPassedAgain, true);
  assert.equal(actual.successfulEarlierBrowserSuitesNotReplayed, true);
  for (const key of ["conversionPerformanceImprovementClaim", "wholeProcessMemoryOrLargeOriginalAcceptance", "allTwelveNativeRebuildsAcceptance", "originalGoalComplete"])
    assert.equal(actual[key], false, key);
});
