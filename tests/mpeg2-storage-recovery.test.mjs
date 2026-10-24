// Synthetic evidence validation only; actual browser results are separate.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
});
