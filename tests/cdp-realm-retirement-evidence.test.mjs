import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const raw = await readFile(new URL("../evidence/2026-11-06T20-14-11-478Z-cdp-realm-retirement.json", import.meta.url));
assert.equal(sha(raw), "f5dffc138683a95c65a92cdd9af303acafb3d154d07a0fc946c616c0a06e64f8");
const report = JSON.parse(raw);
test("real source-pinned Chrome fixture confirms late-session loss in archived control and exact detach in repaired sampler", () => {
  assert.equal(report.status, "passed-real-cdp-retirement-control-and-repair-not-conversion-acceptance");
  assert.equal(report.browserBefore.version, "156.0.8078.80"); assert.deepEqual(report.failures, []);
  assert.equal(report.sourcePins["scripts/lib/cdp-realm-memory.mjs"], "dacac72ad581a52fa46cdcec4fae3cf97e52f065c8594c4341ef6940be9e41bd");
  assert.deepEqual(report.cases.map(row => row.name), ["archived-control", "repaired"]);
  const [old, current] = report.cases;
  for (const row of report.cases) {
    assert.equal(row.actualDelayedAttachmentReply, true); assert.equal(row.targetStillLiveAtRetirement, true);
    assert.equal(row.attachmentCommands, 1); assert.equal(row.unavailableObservationsBeforeRetirement, 5);
    assert.equal(row.ownedTargetClosed, true); assert.equal(row.status, "observed-predicted-lifecycle");
  }
  assert.equal(old.detachCommands, 0); assert.equal(old.samplerHeapQueriesAfterRetirement, 1); assert.equal(old.sessionAddressableAfterReply, true);
  assert.equal(current.detachCommands, 1); assert.equal(current.samplerHeapQueriesAfterRetirement, 0); assert.equal(current.sessionAddressableAfterReply, false);
  assert.match(current.rawSessionProbeError, /Session with given id not found/);
  assert.equal(current.attachmentSummary.leasedEntries, 0); assert.equal(current.attachmentSummary.pendingOperations, 0);
  assert.equal(current.attachmentSummary.maximumLeases, 16); assert.equal(current.attachmentSummary.maximumObservationRacesPerOperation, 1);
  assert.equal(current.attachmentSummary.queuedRequests, 0); assert.equal(current.attachmentSummary.retirementFailures, 0);
});
test("fixture retains normal services, no conversion/media/original access or relaxed memory acceptance; all owned resources gone", () => {
  for (const key of ["headed", "conversionPerformed", "protectedOriginalAccessed", "inputOrOutputMediaCreated", "forcedGc",
    "browserServicesDisabled", "memoryAcceptance", "speedImprovementClaimed", "publicPromotion"]) assert.equal(report[key], false);
  assert.ok(report.launchArguments.includes("--headless=new")); assert.ok(!report.launchArguments.some(value => value.startsWith("--disable-")));
  assert.equal(report.serverClosed, true); assert.equal(report.ownedRuntimeRemoved, true);
  assert.equal(report.browserCleanup.status, "owned-identity-absent"); assert.deepEqual(report.browserAfter, report.browserBefore);
});
test("first broad portable failure remains failed with all5 causes and no qualification relabelled as passed", async () => {
  const r = JSON.parse(await readFile(new URL("../evidence/2026-11-07-cdp-lifecycle-portable-first.json", import.meta.url)));
  assert.equal(r.exitCode, 1); assert.equal(r.counts.tests, 2478); assert.equal(r.counts.passed, 2473); assert.equal(r.counts.failed, 5);
  assert.equal(r.counts.skipped, 0); assert.equal(r.failures.length, 5); assert.equal(r.separateQualificationFilesNotRun, 162);
  assert.equal(r.oldReportsOrHashesEdited, false); assert.equal(r.publicAcceptance, false);
});
