import assert from "node:assert/strict";
import test from "node:test";
import { allocatorConsolePrefix, parseAllocatorConsole } from "../scripts/lib/h264-allocator-console.mjs";

const value = () => ({ sequence: 1, inputBytes: 0, outputBytes: 0, dynamicHeapBytes: 26214400,
  freeDynamicBytes: 1048576, unclaimedHeapBytes: 65536, freeRegions: 1,
  samplerElapsedUs: 20, freeBlockSizeBuckets: Array.from({ length: 32 }, (_, i) => i === 20 ? 1 : 0) });
test("native allocator events transport only bounded numeric snapshots without worker polling", () => {
  const sample = value();
  assert.deepEqual(parseAllocatorConsole(allocatorConsolePrefix + JSON.stringify(sample)), sample);
  assert.equal(parseAllocatorConsole("An unrelated browser message"), null);
});
test("native event parser rejects excess data, file-content fields, invalid numbers and corrupt buckets", () => {
  assert.throws(() => parseAllocatorConsole(allocatorConsolePrefix + "x".repeat(2048)));
  for (const alter of [
    (s) => { s.filename = "private"; }, (s) => { s.sequence = 257; },
    (s) => { s.freeRegions = 0; }, (s) => { s.dynamicHeapBytes = null; },
    (s) => { s.freeBlockSizeBuckets.pop(); },
  ]) { const sample = value(); alter(sample); assert.throws(() => parseAllocatorConsole(allocatorConsolePrefix + JSON.stringify(sample))); }
});
