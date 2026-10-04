import assert from "node:assert/strict";

export const allocatorConsolePrefix = "WITHIN_H264_ALLOCATOR ";
export function parseAllocatorConsole(text) {
  if (!text.startsWith(allocatorConsolePrefix)) return null;
  assert.ok(text.length <= 2048, "Native allocator message exceeds bounded diagnostic size");
  const value = JSON.parse(text.slice(allocatorConsolePrefix.length));
  const numbers = ["sequence", "inputBytes", "outputBytes", "dynamicHeapBytes", "freeDynamicBytes",
    "unclaimedHeapBytes", "freeRegions", "samplerElapsedUs"];
  assert.deepEqual(Object.keys(value).sort(), [...numbers, "freeBlockSizeBuckets"].sort(), "Only numeric allocator diagnostics are allowed");
  for (const key of numbers) assert.ok(Number.isFinite(value[key]) && value[key] >= 0, key);
  assert.ok(Number.isSafeInteger(value.sequence) && value.sequence >= 1 && value.sequence <= 256);
  assert.equal(value.freeBlockSizeBuckets.length, 32);
  assert.ok(value.freeBlockSizeBuckets.every((n) => Number.isSafeInteger(n) && n >= 0));
  assert.equal(value.freeRegions, value.freeBlockSizeBuckets.reduce((sum, n) => sum + n, 0));
  return value;
}
