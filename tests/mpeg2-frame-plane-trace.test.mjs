import assert from "node:assert/strict";
import test from "node:test";
import { summarizeFramePlaneTrace } from "../scripts/lib/mpeg2-frame-plane-trace.mjs";

const row = (sequence, phase, additions = {}) => ({ kind: "frame-plane-allocation", sequence, phase,
  codecId: 2, encoder: true, contextWidth: 1920, contextHeight: 804, codedWidth: 1920, codedHeight: 804,
  width: 1952, height: 836, pixelFormat: 0, plane: 0, requestedBytes: 1600000, linesize: 2048,
  frameBufferBytes: phase === "before" ? 0 : 1600000, succeeded: phase === "before" ? null : true,
  scope: "scalar-request-not-heap-free-space-not-acceptance", ...additions });
const error = "Cannot enlarge memory arrays to size 33783808 bytes (OOM)\nav_buffer_allocz\navcodec_default_get_buffer2";
test("Plane reduction attributes only an actual unmatched request in the native heap-abort path", () => {
  const pending = row(3, "before", { plane: 1, requestedBytes: 450000, frameBufferBytes: 1600000 });
  const result = summarizeFramePlaneTrace([row(1, "before"), row(2, "after"), pending], { error });
  assert.deepEqual(result.failedAllocation, pending); assert.equal(result.completedPlaneRequests, 1);
  assert.equal(result.successfulPlaneRequests, 1); assert.equal(result.nativePlaneHeapAbort, true);
  assert.equal(result.actualCacheRetention, null); assert.equal(result.contiguousFreeBlockCapacity, null);
  assert.equal(result.runtimeHeapSavingsBytes, null); assert.equal(result.primaryMemoryAcceptance, false);
  assert.equal(result.speedGainClaim, null);
  assert.equal(summarizeFramePlaneTrace([row(1, "before"), row(2, "after")], { error }).failedAllocation, null);
  for (const unrelated of ["", "complete", "250MiB limit", "OOM elsewhere", "Cannot enlarge memory arrays to size 33783808 bytes (OOM)"])
    assert.equal(summarizeFramePlaneTrace([pending], { error: unrelated }).failedAllocation, null);
});
test("Missing prefix, eviction and a reached event cap never become exact allocation attribution", () => {
  assert.equal(summarizeFramePlaneTrace([row(3, "before")], { error }).failedAllocation, null);
  assert.equal(summarizeFramePlaneTrace([row(1, "before")], { error, eventsEvicted: 1 }).failedAllocation, null);
  const events = Array.from({ length: 192 }, (_, i) => row(i + 1, i % 2 ? "after" : "before"));
  const result = summarizeFramePlaneTrace(events, { error });
  assert.equal(result.capReached, true); assert.equal(result.failedAllocation, null);
  assert.equal(summarizeFramePlaneTrace([], { error }).failedAllocation, null);
});
test("Malformed plane scalars, gaps, mismatched pairs and payload overhead guesses are refused", () => {
  for (const change of [{ sequence: 0 }, { requestedBytes: 0 }, { frameBufferBytes: null },
    { plane: 4 }, { encoder: 1 }, { succeeded: false }, { filename: "not-allowed" },
    { width: Infinity }, { linesize: -1 }])
    assert.throws(() => summarizeFramePlaneTrace([row(1, "before", change)]));
  assert.throws(() => summarizeFramePlaneTrace([row(1, "before"), row(3, "after")]));
  assert.throws(() => summarizeFramePlaneTrace([row(1, "before"), row(2, "before")]));
  assert.throws(() => summarizeFramePlaneTrace([row(1, "before"), row(2, "after", { plane: 1 })]));
  assert.throws(() => summarizeFramePlaneTrace([row(1, "before"), row(2, "after", { frameBufferBytes: 1600016 })]));
  assert.throws(() => summarizeFramePlaneTrace([row(1, "after")]));
  assert.throws(() => summarizeFramePlaneTrace(Array(193).fill(row(1, "before"))));
});
