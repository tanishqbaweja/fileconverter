import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const file = "evidence/2026-11-15T00-31-57-030Z-mkv-startup-core-loop-source-control.json";

test("real loop-source browser output retains genuine payload proof AND strict DTS failure, never acceptance", async () => {
  const bytes = await readFile(file);
  assert.equal(sha(bytes), "9e80b288d17288be539864a6493368668b0c18ee9c3f32acce245f580167a5b3");
  const report = JSON.parse(bytes), [arm] = report.arms, [row] = arm.cases;
  assert.equal(report.status, "failed-not-acceptance"); assert.equal(arm.status, "failed-not-acceptance");
  assert.equal(row.state, "complete"); assert.equal(report.scalingLoopSourceControl, true);
  assert.equal(row.metrics.inputBytes, 11887449); assert.equal(row.metrics.outputBytes, 11894121);
  assert.equal(report.fixture.sha256, "fe5f8d41d50faf86054455b7a97d47b754aaf39fbe6883f4c0496767224a2629");
  assert.equal(row.validation.outputSha256, "fe7005cc0b2a3293a2751463b6f146466dcdb92e31c76a9707d55b65d36f0919");
  assert.equal(row.validation.completeEncodedStreamHashesEqual, true);
  assert.equal(row.validation.sourcePacketHashes, row.validation.outputPacketHashes);
  assert.match(arm.failures.join("\n"), /Video DTS exceeds one source tick at packet 291/);
  assert.match(arm.failures.join("\n"), /AggregateError: One or more owned cleanup actions failed/);
  assert.equal(row.validation.aac, undefined); assert.equal(row.validation.fullIndependentDecode, undefined);
  assert.equal(arm.serverCleanup, undefined); assert.equal(arm.ownedRuntimeRemoved, undefined); assert.equal(report.fixtureRuntimeRemoved, undefined);
  assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent");
  assert.deepEqual(report.originalBefore, report.originalAfter);
  assert.equal(report.headed, false); assert.equal(report.nativeConversionUsed, false); assert.equal(report.publicAcceptance, false);
  assert.equal(report.peakLimitMiB, 250); assert.equal(report.cleanupLimitMiB, 96);
  const packed = await readFile(arm.archive.file); assert.equal(packed.length, arm.archive.bytes); assert.equal(sha(packed), arm.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 4 * 1048576 }); assert.equal(sha(raw), arm.archive.decodedSha256);
  assert.ok(JSON.parse(raw).length > 0);
});

test("small source-loop inspection records the actual 31ms discontinuity and removed source; not a >4GB conversion", async () => {
  const report = JSON.parse(await readFile("evidence/2026-11-15T00-31-30-793Z-mkv-scaling-loop-feasibility.json"));
  assert.equal(report.status, "source-loop-feasibility-inspected-not-browser-acceptance");
  assert.equal(report.generatedBytes, 11887449); assert.equal(report.videoPackets, 576);
  assert.equal(report.maximumKnownDtsVsCurrentNominalPolicyErrorUs, 31000);
  assert.equal(report.join.find(row => row.index === 290).errorUs, 31000);
  assert.equal(report.generatedSourceRemovedInFinally, true);
  assert.equal(report.nativeToolUsedOnlyForFixtureGenerationAndInspection, true);
});

test("separate recovery verifies owned server births and removes only the two recorded job directories without rewriting the failure", async () => {
  const recovery = JSON.parse(await readFile("evidence/2026-11-15-mkv-loop-source-owned-recovery.json"));
  assert.equal(recovery.sourceFile, file);
  assert.equal(recovery.status, "owned-server-and-disposable-data-recovered-failed-conversion-still-failed");
  assert.equal(recovery.allObservedServerBirthsAbsent, true); assert.equal(recovery.after.length, recovery.serverTreeBefore.length);
  assert.equal(recovery.serverTreeBefore.length, 8);
  for (const row of recovery.after) assert.ok(row.current === null || row.pidReused);
  assert.deepEqual(recovery.removed, ["work\\mkv-direct-reuse-q4Og5Q", "work\\mkv-direct-reuse-fixture-1FhHCc"]);
  assert.equal(recovery.removedOutputBytes, 11894121); assert.equal(recovery.removedGeneratedSourceBytes, 11887449);
  assert.equal(recovery.protectedOriginalUnchanged, true); assert.equal(recovery.unrelatedProcessesKilled, false);
  assert.equal(recovery.originalBrowserFailureReclassified, false);
});
