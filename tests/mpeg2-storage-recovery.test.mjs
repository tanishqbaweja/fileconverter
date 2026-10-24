// Synthetic evidence validation only; actual browser results are separate.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { mpeg2StorageRecoveryCases, assertMpeg2StorageFailure } from "../scripts/lib/mpeg2-storage-recovery.mjs";
function fixture(fault) {
  return { destinationUnchanged: true, stageNames: [], result: { type: "error",
    message: fault === "quota" ? "The destination ran out of quota after a bounded write." : "Destination permission was revoked after a bounded write.",
    phases: ["Encoding MPEG-2 MP4", "Copying staged MP4 to selected destination"], nativeMetrics: { wasmMemoryBytes: 48 * 1048576 },
    metrics: { outputBytes: 524288, scratchBytes: 0, pendingOperations: 0, queuedBytes: 0, peakPendingOperations: 1,
      peakQueuedBytes: 524288, wasmMemoryBytes: 0, peakWasmMemoryBytes: 48 * 1048576 } } };
}
test("finite storage cases test each failure and immediate retry without repeating cancellation", () => {
  const cases = mpeg2StorageRecoveryCases();
  assert.deepEqual(cases.map(c => c.expected), ["error", "complete", "error", "complete"]);
  assert.deepEqual(cases.filter(c => c.testFault).map(c => c.testFault), ["quota", "permission"]);
  cases[0].testFault = "wrong"; assert.equal(mpeg2StorageRecoveryCases()[0].testFault, "quota");
});
test("storage evidence requires real native/final writes, rollback, stage removal and bounded terminal metrics", () => {
  for (const c of mpeg2StorageRecoveryCases().filter(c => c.testFault)) {
    assert.doesNotThrow(() => assertMpeg2StorageFailure(c, fixture(c.testFault)));
    for (const mutate of [f => f.destinationUnchanged = false, f => f.stageNames.push("abandoned"),
      f => f.result.phases.pop(), f => f.result.metrics.outputBytes = 0, f => f.result.metrics.queuedBytes = 1,
      f => f.result.metrics.pendingOperations = 1, f => f.result.metrics.scratchBytes = 1,
      f => f.result.metrics.peakPendingOperations = 2, f => f.result.nativeMetrics.wasmMemoryBytes = 0,
      f => f.result.message = "unrelated failure"]) {
      const f = fixture(c.testFault); mutate(f); assert.throws(() => assertMpeg2StorageFailure(c, f));
    }
  }
});
test("actual storage driver retains production path, validators, fixed native selection and honest scope", async () => {
  const source = await readFile(new URL("../scripts/test-mpeg2-production-runtime.mjs", import.meta.url), "utf8");
  assert.match(source, /storageRecovery \? mpeg2StorageRecoveryCases\(\)/);
  assert.match(source, /window\.__WITHIN_TEST__\.runQualificationJob\(job\)/);
  assert.match(source, /assertMpeg2StorageFailure\(testCase, execution\)/);
  assert.match(source, /actualQuotaExhaustion: false/); assert.match(source, /actualOsPermissionRevocation: false/);
  assert.match(source, /nativeDuringEncodingCancellation: !storageRecovery/);
  assert.match(source, /assert.ok\(ssim >= 0.98/); assert.match(source, /report.memory.incrementalPrivateMiB <= 250/);
  assert.match(source, /assert.equal\(await audioHash\(output\), await audioHash\(fixture\)\)/);
  assert.match(source, /recovery && !storageRecovery && repetition <= 2/);
  assert.ok(source.indexOf("report.memory = {") < source.indexOf('"Actual active native progress was not visibly verified"'));
  assert.ok(source.indexOf("report.executedSourcesAndBrowserPinsVerified = true") < source.indexOf('"Actual active native progress was not visibly verified"'));
});
test("actual storage faults and retries remain verified evidence without relabelling failed visual acceptance", async () => {
  const root = new URL("../", import.meta.url), hash = b => createHash("sha256").update(b).digest("hex");
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-24T06-11-09.036Z-mpeg2-storage-recovery-result.json", root)));
  const packed = await readFile(new URL(receipt.archive.path, root)); assert.equal(hash(packed), receipt.archive.sha256);
  const bytes = gunzipSync(packed, { maxOutputLength: 4 * 1048576 }); assert.equal(hash(bytes), receipt.archive.restoredSha256);
  const r = JSON.parse(bytes), cases = mpeg2StorageRecoveryCases();
  assert.equal(r.status, "failed"); assert.equal(receipt.overallGatePassed, false); assert.equal(receipt.memory, null);
  assert.match(r.failures[0], /Actual active native progress was not visibly verified/);
  assert.equal(r.recoveryQualification.cases.length, 4);
  for (const [index, c] of r.recoveryQualification.cases.entries()) {
    assert.equal(c.name, cases[index].name); assert.equal(c.result.type, cases[index].expected);
    if (cases[index].testFault) { assertMpeg2StorageFailure(cases[index], c); assert.equal(c.terminalWorkerRetired, true); }
    else {
      assert.equal(c.independentOutput.sha256, "11a53d672a155d12630bd0bc9fb39f012db05ce1ed4abebfe178a3b679451886");
      assert.equal(c.independentOutput.frames, 96); assert.ok(c.independentOutput.ssim >= 0.98);
      assert.ok(c.independentOutput.videoClocks.maximumVideoPtsErrorSeconds < 0.001);
      assert.equal(c.independentOutput.fullNativeDecodePassed, true);
      assert.equal(c.independentOutput.titlePreserved, true); assert.equal(c.independentOutput.languagePreserved, true);
    }
  }
  assert.equal(receipt.recordedSourcesMatchHistoricalGitHead, true); assert.equal(receipt.sourcePins, 45);
  const samples = r.diagnosticMemorySamples; assert.equal(samples.length, 412);
  for (const s of samples) { assert.notEqual(s.privateBytes, null); assert.equal(s.privateBytes, s.processes.reduce((n, p) => n + p.privateBytes, 0)); }
  const peak = samples.filter(s => s.phase !== "blank").reduce((a, b) => a.privateBytes > b.privateBytes ? a : b);
  assert.equal((peak.privateBytes - r.blankBaseline.privateBytes) / 1048576, 228.51953125);
  assert.equal(receipt.independentlyRecomputedObservedMemory.incrementalPrivateMiB, 228.51953125);
  assert.equal(receipt.independentlyRecomputedObservedMemory.originalRunAccepted, false);
  assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true); assert.equal(receipt.protectedOriginalUnchangedAtExecution, true);
  assert.equal(receipt.storageRecoveryQualification.faultInjection, true);
  assert.equal(receipt.storageRecoveryQualification.actualQuotaExhaustion, false);
  assert.equal(receipt.storageRecoveryQualification.actualOsPermissionRevocation, false);
  assert.equal(receipt.boundedVisibleProgressVerified, false); assert.equal(receipt.publicAcceptance, false);
});
