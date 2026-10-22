// Historical incident evidence, never fresh or full-scope conversion acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
const read = file => readFile(new URL("../" + file, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
async function archive(metadata) {
  assert.match(metadata.path, /^output\/playwright\/vpx-decoder-qualification-[0-9TZ.-]+\.json\.gz$/);
  const zip = await read(metadata.path); assert.equal(zip.length, metadata.bytes); assert.equal(sha(zip), metadata.sha256);
  const bytes = gunzipSync(zip, { maxOutputLength: 16 * 1048576 });
  assert.equal(bytes.length, metadata.restoredBytes); assert.equal(sha(bytes), metadata.restoredSha256); return JSON.parse(bytes);
}

test("first volume correctness remains distinct from missing memory coverage and manually remediated cleanup", async () => {
  const evidence = JSON.parse(await read("evidence/2026-10-22-vpx-first-volume-observer-failure.json")), report = await archive(evidence.report);
  assert.equal(report.memoryAcceptance, false); assert.equal(report.primaryIncrementalPrivateMiB, null);
  assert.equal(evidence.memoryAcceptance, false); assert.equal(evidence.publicAcceptance, false); assert.equal(evidence.near10GiBAcceptance, false);
  assert.match(report.monitorFailure, /observer response timed out/);
  const tests = report.rows.filter(row => row.test); assert.equal(tests.length, 3);
  assert.deepEqual(tests.map(row => row.status), ["passed", "passed", "failed"]);
  assert.equal(report.memorySamples.length, evidence.receivedSamples);
  const vp9 = report.rows.find(row => row.codec === "vp9" && row.conversionWindow);
  assert.ok(vp9);
  assert.ok(Date.parse(report.memorySamples.at(-1).timestamp) < report.memoryPhases.find(row => row.phase === "conversion-vp9-2").at);
  assert.notEqual(report.disposableDataRemoved, true); assert.equal(evidence.cleanupIncident.manualRemediationVerified, true);
  assert.equal(evidence.cleanupIncident.recordedBrowserIdentitiesStillAlive, 0);
  for (const actual of report.rows.filter(row => row.independentValidation)) {
    const expected = evidence.results.find(row => row.codec === actual.codec), output = actual.independentValidation;
    assert.equal(output.outputSha256, expected.outputSha256); assert.equal(output.outputBytes, expected.outputBytes);
    assert.equal(output.frames, expected.frames); assert.equal(output.ssim, expected.ssim);
    assert.equal(output.fullDecode, true); assert.equal(output.audioPacketsIdentical, true);
  }
});

test("diagnostic proves fail-fast and safe cleanup without turning observer failure into a pass", async () => {
  const evidence = JSON.parse(await read("evidence/2026-10-22-vpx-observer-starvation-diagnosis.json")), report = await archive(evidence.diagnosticReport);
  assert.equal(report.memoryAcceptance, false); assert.equal(report.primaryIncrementalPrivateMiB, null);
  assert.deepEqual(report.rows.filter(row => row.test).map(row => row.status), ["passed", "failed"]);
  assert.equal(report.rows.filter(row => row.result?.type === "complete").length, 1);
  assert.equal(Object.keys(report.executedSourcePins).length, 41); assert.equal(report.executedSourcesAndBrowserPinsVerified, true);
  assert.equal(report.observerTransport.maximumRequestMs, evidence.browserResult.maximumObserverRequestMs);
  assert.ok(report.observerTransport.maximumRequestMs > evidence.browserResult.nativeObserverTimeoutMsUnchanged);
  assert.equal(report.disposableDataRemoved, true);
  assert.deepEqual(report.cleanupPhases.map(row => row.status), ["passed", "failed", "passed", "passed"]);
  assert.match(JSON.stringify(report.cleanupPhases[1].error), /observer response timed out/);
  assert.equal(report.serverCleanup.ownedRootAbsent, true); assert.equal(evidence.cleanup.recordedBrowserIdentitiesStillAlive, 0);
  assert.equal(evidence.publicAcceptance, false); assert.equal(evidence.near10GiBAcceptance, false);
  assert.equal(evidence.controls.actualPlaywrightOriginalAssertions.observerIoServicedDuringLoop, false);
  assert.ok(evidence.controls.actualPlaywrightOriginalAssertions.elapsedMs > 5000);
  assert.equal(evidence.controls.actualPlaywrightCorrectedValidator.observerIoServicedDuringLoop, true);
  assert.ok(evidence.controls.actualPlaywrightCorrectedValidator.firstIoAtFrame <= 32);
});

test("corrected observation retains the real nine-process365MiB failure and unproven startup-child cause", async () => {
  const evidence = JSON.parse(await read("evidence/2026-10-22-vpx-first-volume-memory-result.json")), report = await archive(evidence.report);
  assert.deepEqual(report.rows.filter(row => row.test).map(row => row.status), ["passed", "passed", "failed"]);
  assert.equal(report.monitorFailure, null); assert.equal(report.observerTransport.failures, 0);
  assert.equal(report.memorySamples.length, 2247); assert.ok(report.memorySamples.every(row => row.privateBytes !== null));
  const peak = report.memorySamples.filter(row => row.phase !== "blank").reduce((a, b) => a.privateBytes >= b.privateBytes ? a : b);
  assert.equal(peak.privateBytes, evidence.peakPrivateBytes); assert.equal(peak.processes.length, 9);
  assert.equal(peak.privateBytes, peak.processes.reduce((sum, process) => sum + process.privateBytes, 0));
  const incremental = (peak.privateBytes - report.blankBaseline.privateBytes) / 1048576;
  assert.equal(incremental, 365.15625); assert.equal(incremental, evidence.incrementalPrivateMiB);
  assert.equal(report.primaryIncrementalPrivateMiB, incremental); assert.equal(report.memoryAcceptance, false);
  const unknown = peak.processes.find(row => row.pid === evidence.peak.largestProcess.pid);
  assert.equal(unknown.type, "unknown"); assert.equal(unknown.privateBytes, 260968448);
  assert.equal(unknown.creationFileTime, evidence.peak.largestProcess.creationFileTime);
  assert.equal(Object.keys(report.executedSourcePins).length, 42); assert.equal(report.executedSourcesAndBrowserPinsVerified, true);
  assert.ok(report.cleanupPhases.every(row => row.status === "passed")); assert.equal(report.disposableDataRemoved, true);
  assert.equal(report.serverCleanup.ownedRootAbsent, true); assert.equal(evidence.cleanup.recordedBrowserIdentitiesStillAlive, 0);
  const old = JSON.parse(await read(evidence.startupCorrelation.priorEvidence));
  assert.equal(old.control.cleanup.conversionsPerformed, 0); assert.equal(old.control.cleanup.inputFilesSelected, 0);
  assert.equal(old.control.peak.browserAgeMs, evidence.startupCorrelation.priorBlankPeakBrowserAgeMs);
  assert.equal(evidence.startupCorrelation.noBaselineIncreaseOrDelayedMeasurementOrProcessExclusionAuthorizedByThisCorrelation, true);
  assert.equal(evidence.publicAcceptance, false); assert.equal(evidence.near10GiBAcceptance, false); assert.equal(evidence.fullGoalComplete, false);
});
