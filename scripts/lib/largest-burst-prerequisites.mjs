import assert from "node:assert/strict";
export function assertLargestBurstPrerequisites(blank, ui) {
  assert.equal(blank.status, "completed-largest-blink-type-control");
  assert.equal(ui.status, "completed-diagnostic"); assert.equal(ui.traces.length, 2);
  assert.equal(blank.originalRead, false); assert.equal(blank.converterLoaded, false);
  assert.equal(blank.nativeObserverStarted, false); assert.equal(blank.syntheticAllocationBytes, 0);
  for (const proof of [blank, ui]) {
    assert.equal(proof.outerGeneratedRuntimeRemoved, true);
    assert.equal(proof.generatedMediaCopies, 0); assert.equal(proof.conversionsPerformed, 0);
    assert.equal(proof.noForcedGc, true);
    for (const value of Object.values(proof.cleanup)) assert.equal(value, true);
  }
  for (const trace of [blank.trace, ...ui.traces]) {
    assert.equal(trace.status, "completed-diagnostic");
    assert.equal(trace.trace.dataLossOccurred, false); assert.equal(trace.trace.overflow, false);
    assert.equal(trace.trace.parseError, null); assert.equal(trace.dumps.length, 1);
    assert.equal(trace.limits.chromiumBufferBytes, 4194304); assert.equal(trace.limits.maximumSerializedBytes, 16777216);
  }
}
