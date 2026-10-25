// Finite real-pipeline interruption evidence, not successful-output acceptance.
import assert from "node:assert/strict";
export function validateAudioInterruption(kind, state, { beforeCancel = null, storageBefore, storageAfter } = {}) {
  assert.ok(["cancel", "write"].includes(kind)); assert.equal(state.jobState, kind === "cancel" ? "cancelled" : "error");
  assert.equal(state.opfsName, null); assert.deepEqual(state.opfsNames, []);
  assert.equal(state.workerStatus, "ready", "The production lifecycle must recover its worker before another job");
  const metrics = state.metrics; assert.ok(metrics && metrics.peakWasmMemoryBytes >= 33554432);
  assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0); assert.ok(metrics.peakPendingOperations <= 1);
  for (const size of [metrics.maxReadChunkBytes, metrics.maxWriteChunkBytes, metrics.peakQueuedBytes]) assert.ok(size <= 262144);
  assert.ok(Array.isArray(storageBefore) && storageBefore.length === 0, "Use a verified fresh owned OPFS root");
  assert.deepEqual(storageAfter, storageBefore, "No partial output or scratch entry may survive the interruption");
  if (kind === "cancel") {
    assert.ok(beforeCancel && beforeCancel.jobState === "running");
    assert.ok(beforeCancel.metrics.inputBytes > 0 && beforeCancel.metrics.outputBytes > 0, "Cancel only after genuine input AND output progress");
    assert.ok(metrics.outputBytes > 0); assert.equal(state.error, null);
  } else {
    assert.match(state.error, /destination rejected a bounded write/i);
    assert.ok(metrics.peakQueuedBytes > 0 && metrics.peakPendingOperations === 1, "The real native writer must have attempted an operation");
  }
  return { status: "passed-private-audio-interruption-cleanup", kind, expectedTerminal: state.jobState,
    realProgressBeforeCancel: kind === "cancel", noRetainedPartialEntries: true, workerRecovered: true,
    cancellationClickedInUi: kind === "cancel", faultModel: kind === "write" ? "existing-localhost-error-after-real-bounded-write-not-OS-failure" : null,
    outputAcceptance: false, publicAcceptance: false };
}
