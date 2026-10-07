import assert from "node:assert/strict";
import test from "node:test";
import { joinMicrosecondNativeTypes, microsecondBirth } from "../scripts/lib/microsecond-native-type-join.mjs";
const trace = (phase, createdAt, bytes, parentPid = 1) => ({ status: "completed-diagnostic",
  dumps: [{ phase, processes: [{ pid: 2, parentPid, createdAt }] }],
  allocatorSummary: [{ phase, processes: [{ pid: 2, blinkTypeStatistics: [{ originalNameSha256: "a", heap: "blink_gc/main", allocatedObjectsBytes: bytes, objectCount: 1 }] }] }] });
test("observed CIM microsecond vs native 100ns birth precision joins actual identity without rewriting originals", () => {
  const traces = [trace("before", "2026-10-07T11:01:09.3586260Z", 10), trace("after", "2026-10-07T11:01:09.3586266Z", 20)];
  const frozen = JSON.stringify(traces), joined = joinMicrosecondNativeTypes(traces);
  assert.equal(joined.length, 1); assert.equal(joined[0].types[0].deltaAllocatedObjectsBytes, 10);
  assert.equal(joined[0].birthComparison.timestampsExactlyEqual, false);
  assert.equal(joined[0].birthComparison.afterCreatedAt, "2026-10-07T11:01:09.3586266Z");
  assert.equal(JSON.stringify(traces), frozen); assert.equal(joined[0].originalConversionCause, null);
});
test("new microsecond birth, different parent and insufficient timestamp precision cannot create a type delta", () => {
  const a = trace("before", "2026-10-07T11:01:09.3586260Z", 10);
  for (const b of [trace("after", "2026-10-07T11:01:09.3586270Z", 20), trace("after", "2026-10-07T11:01:09.3586266Z", 20, 9), trace("after", "2026-10-07T11:01:09.358Z", 20)])
    assert.equal(joinMicrosecondNativeTypes([a, b]).length, 0);
  assert.equal(microsecondBirth("unavailable"), null);
  assert.equal(joinMicrosecondNativeTypes([trace("before", "unavailable", 10), trace("after", "unavailable", 20)]).length, 0);
});
