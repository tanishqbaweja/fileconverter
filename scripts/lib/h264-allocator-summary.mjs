import assert from "node:assert/strict";

const MiB = 1024 ** 2;
// Buckets are payload size ranges, not exact largest-block sizes. These
// snapshots cannot identify individual live allocations or the failed instant.
export function summarizeH264Allocator(samples, fixedBytes = 32 * MiB) {
  assert.ok(Array.isArray(samples) && samples.length > 1 && samples.length <= 768);
  const normalized = samples.map((s) => {
    for (const key of ["sequence", "inputBytes", "outputBytes", "dynamicHeapBytes", "freeDynamicBytes",
      "unclaimedHeapBytes", "freeRegions", "samplerElapsedUs"]) assert.ok(Number.isFinite(s[key]) && s[key] >= 0, key);
    assert.ok(s.dynamicHeapBytes <= fixedBytes && s.freeDynamicBytes <= s.dynamicHeapBytes && s.unclaimedHeapBytes <= fixedBytes);
    assert.ok(s.dynamicHeapBytes + s.unclaimedHeapBytes <= fixedBytes);
    assert.equal(s.freeBlockSizeBuckets.length, 32);
    assert.ok(s.freeBlockSizeBuckets.every((n) => Number.isSafeInteger(n) && n >= 0));
    assert.equal(s.freeRegions, s.freeBlockSizeBuckets.reduce((a, b) => a + b, 0));
    const bucket = s.freeBlockSizeBuckets.findLastIndex((n) => n > 0);
    return { ...s, dynamicUsedIncludingAllocatorOverheadBytes: s.dynamicHeapBytes - s.freeDynamicBytes,
      theoreticalTotalAvailableBytes: s.freeDynamicBytes + s.unclaimedHeapBytes,
      largestFreePayloadLowerBoundBytes: bucket < 0 ? 0 : bucket === 0 ? 0 : 2 ** bucket,
      largestFreePayloadExclusiveUpperBoundBytes: bucket < 0 ? 0 : 2 ** (bucket + 1) };
  });
  const first = normalized[0], last = normalized.at(-1);
  return { observedSnapshots: normalized.length, first, last,
    maximumDynamicUsedIncludingAllocatorOverheadBytes: Math.max(...normalized.map((s) => s.dynamicUsedIncludingAllocatorOverheadBytes)),
    minimumTheoreticalTotalAvailableBytes: Math.min(...normalized.map((s) => s.theoreticalTotalAvailableBytes)),
    maximumSamplerElapsedUs: Math.max(...normalized.map((s) => s.samplerElapsedUs)),
    lastFreePayloadTooSmallForSuspendStack: last.largestFreePayloadExclusiveUpperBoundBytes <= 1048588,
    lastUnclaimedTooSmallForSuspendStack: last.unclaimedHeapBytes < 1048588,
    liveUsedDeltaBytes: last.dynamicUsedIncludingAllocatorOverheadBytes - first.dynamicUsedIncludingAllocatorOverheadBytes,
    individualAllocationSourceProven: false, failedInstantSnapshotAvailable: false,
    acceptanceMetric: false, publicAcceptance: false };
}
