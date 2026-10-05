import assert from "node:assert/strict";
import test from "node:test";
import { refstructSampleBytes } from "../scripts/lib/refstruct-sample-bytes.mjs";

const sample = { kind: "refstruct-pool", statisticsComplete: true,
  entryPayloadBytes: 1024, entryRequestedAllocationBytes: 1088,
  checkedOutEntries: 2, cachedEntries: 1 };
test("Pool byte diagnostics distinguish live/cached requested backing without guessing overhead", () => {
  assert.deepEqual(refstructSampleBytes(sample), { available: true,
    requestedLiveBytes: 2176, requestedCachedBytes: 1088,
    requestedTotalBackingBytes: 3264, allocatorOverheadBytes: null });
  assert.equal(refstructSampleBytes({ ...sample, cachedEntries: 0 }).requestedCachedBytes, 0);
});
test("Incomplete, malformed and overflowing pool byte samples remain unavailable, never valid zero", () => {
  for (const value of [null, {}, { ...sample, statisticsComplete: false },
    { ...sample, cachedEntries: null }, { ...sample, checkedOutEntries: -1 },
    { ...sample, checkedOutEntries: 0.1 }, { ...sample, entryRequestedAllocationBytes: 1024 },
    { ...sample, entryRequestedAllocationBytes: 0xffffffff, checkedOutEntries: 0xffffffff }]) {
    const result = refstructSampleBytes(value);
    assert.equal(result.available, false);
    assert.equal(result.requestedLiveBytes, null); assert.equal(result.requestedCachedBytes, null);
    assert.equal(result.requestedTotalBackingBytes, null);
  }
});
