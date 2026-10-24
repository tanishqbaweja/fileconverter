// Finite fault-injection qualification, never a claim of real OS revocation or
// physical disk/quota exhaustion. The converter still performs real native work.
import assert from "node:assert/strict";
export function mpeg2StorageRecoveryCases() {
  return [
    { name: "final-quota-failure", expected: "error", testFault: "quota" },
    { name: "recover-after-quota-failure", expected: "complete" },
    { name: "final-permission-failure", expected: "error", testFault: "permission" },
    { name: "recover-after-permission-failure", expected: "complete" },
  ];
}
export function assertMpeg2StorageFailure(testCase, execution) {
  assert.ok(["quota", "permission"].includes(testCase.testFault));
  assert.equal(execution.result.type, "error");
  assert.match(execution.result.message, testCase.testFault === "quota" ? /ran out of quota after a bounded write/i : /permission was revoked after a bounded write/i);
  assert.equal(execution.destinationUnchanged, true);
  assert.deepEqual(execution.stageNames, []);
  assert.ok(execution.result.phases.includes("Encoding MPEG-2 MP4"));
  assert.ok(execution.result.phases.includes("Copying staged MP4 to selected destination"));
  const metrics = execution.result.metrics;
  assert.equal(metrics.outputBytes, 512 * 1024, "Fault must follow one real fixed bounded final write");
  assert.equal(metrics.scratchBytes, 0); assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0);
  assert.equal(metrics.peakPendingOperations, 1); assert.ok(metrics.peakQueuedBytes <= 512 * 1024);
  assert.equal(metrics.wasmMemoryBytes, 0); assert.equal(metrics.peakWasmMemoryBytes, 48 * 1048576);
  assert.equal(execution.result.nativeMetrics.wasmMemoryBytes, 48 * 1048576);
}
