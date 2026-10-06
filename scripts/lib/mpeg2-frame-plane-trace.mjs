// Read-only scalar reduction; never dereference memory or infer allocator state.
import assert from "node:assert/strict";

const identityFields = ["codecId", "encoder", "contextWidth", "contextHeight", "codedWidth", "codedHeight",
  "width", "height", "pixelFormat", "plane", "requestedBytes", "linesize"];
const fields = ["kind", "sequence", "phase", ...identityFields, "frameBufferBytes", "succeeded", "scope"].sort();
const scope = "scalar-request-not-heap-free-space-not-acceptance";
const integer = (value, minimum, maximum) => Number.isSafeInteger(value) && value >= minimum && value <= maximum;

export function summarizeFramePlaneTrace(samples, { error = "", eventsEvicted = 0 } = {}) {
  assert.ok(Array.isArray(samples) && samples.length <= 192, "Bounded native plane event cap");
  assert.equal(typeof error, "string"); assert.ok(error.length <= 32768);
  assert.ok(integer(eventsEvicted, 0, Number.MAX_SAFE_INTEGER));
  let pending = null, completed = 0, successful = 0, sequence = null;
  for (const row of samples) {
    assert.ok(row && typeof row === "object" && !Array.isArray(row));
    assert.deepEqual(Object.keys(row).sort(), fields, "Exact scalar schema only");
    assert.equal(row.kind, "frame-plane-allocation"); assert.equal(row.scope, scope);
    assert.ok(integer(row.sequence, 1, 192));
    if (sequence !== null) assert.equal(row.sequence, sequence + 1, "No silent event gap");
    sequence = row.sequence;
    assert.ok(["before", "after"].includes(row.phase)); assert.equal(typeof row.encoder, "boolean");
    assert.ok(integer(row.codecId, 1, 0x7fffffff)); assert.ok(integer(row.plane, 0, 3));
    for (const name of ["contextWidth", "contextHeight", "codedWidth", "codedHeight", "width", "height"])
      assert.ok(integer(row[name], 0, 32768), name);
    assert.ok(integer(row.pixelFormat, -1, 0x7fffffff));
    assert.ok(integer(row.requestedBytes, 1, 33554432));
    assert.ok(integer(row.frameBufferBytes, 0, 33554432));
    assert.ok(integer(row.linesize, 1, 33554432));
    if (row.phase === "before") {
      assert.equal(row.succeeded, null, "Before request is not a successful zero");
      assert.equal(pending, null, "No nested/missing-after plane acquisition"); pending = row;
    } else {
      assert.equal(typeof row.succeeded, "boolean");
      if (pending) {
        for (const name of identityFields) assert.equal(row[name], pending[name], name);
        if (row.succeeded) assert.equal(row.frameBufferBytes, pending.frameBufferBytes + row.requestedBytes,
          "Actual AVBuffer payload only, not allocator overhead");
      } else assert.ok(eventsEvicted > 0 && row === samples[0], "After requires matching before");
      completed++; if (row.succeeded) successful++; pending = null;
    }
  }
  const capReached = sequence === 192;
  const completeObservedPrefix = eventsEvicted === 0 && samples[0]?.sequence === 1;
  const nativePlaneHeapAbort = /Cannot enlarge memory arrays to size \d+ bytes \(OOM\)/.test(error)
    && /av_buffer_allocz[\s\S]*avcodec_default_get_buffer2/.test(error);
  // An unmatched pre-request is attributable only when the actual native abort
  // is in this allocation path and neither eviction nor the event cap hides it.
  const failedAllocation = pending && nativePlaneHeapAbort && completeObservedPrefix && !capReached
    ? { ...pending } : null;
  return { scope: "scalar-plane-trace-not-heap-free-space-not-acceptance", events: samples.length,
    completedPlaneRequests: completed, successfulPlaneRequests: successful,
    capReached, completeObservedPrefix, eventsEvicted, nativePlaneHeapAbort,
    lastUnmatchedBefore: pending ? { ...pending } : null, failedAllocation,
    actualCacheRetention: null, contiguousFreeBlockCapacity: null, runtimeHeapSavingsBytes: null,
    primaryMemoryAcceptance: false, speedGainClaim: null };
}
