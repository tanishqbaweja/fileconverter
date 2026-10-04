import assert from "node:assert/strict";
import test from "node:test";
import { summarizeH264Allocator } from "../scripts/lib/h264-allocator-summary.mjs";

const sample = () => ({ sequence: 1, inputBytes: 0, outputBytes: 0, dynamicHeapBytes: 28 * 1024 ** 2,
  freeDynamicBytes: 6 * 1024 ** 2, unclaimedHeapBytes: 0, freeRegions: 12, samplerElapsedUs: 300,
  freeBlockSizeBuckets: Array.from({ length: 32 }, (_, i) => i === 19 ? 12 : 0) });
test("native allocator summary distinguishes total free bytes from contiguous size bounds without inventing a cause", () => {
  const a = sample(), b = sample(); b.sequence = 2; b.inputBytes = 100000000;
  const summary = summarizeH264Allocator([a, b]);
  assert.equal(summary.last.theoreticalTotalAvailableBytes, 6 * 1024 ** 2);
  assert.equal(summary.last.largestFreePayloadLowerBoundBytes, 524288);
  assert.equal(summary.last.largestFreePayloadExclusiveUpperBoundBytes, 1048576);
  assert.equal(summary.lastFreePayloadTooSmallForSuspendStack, true);
  assert.equal(summary.individualAllocationSourceProven, false);
  assert.equal(summary.failedInstantSnapshotAvailable, false);
  assert.equal(summary.acceptanceMetric, false);
});
test("allocator summary rejects unavailable, over-budget and internally inconsistent native snapshots", () => {
  assert.throws(() => summarizeH264Allocator([]));
  for (const alter of [
    (s) => { s.freeRegions++; }, (s) => { s.unclaimedHeapBytes = 32 * 1024 ** 2; },
    (s) => { s.freeDynamicBytes = null; }, (s) => { s.freeBlockSizeBuckets.pop(); },
  ]) { const a = sample(); alter(a); assert.throws(() => summarizeH264Allocator([a, sample()])); }
});
