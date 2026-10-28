import assert from "node:assert/strict";
import test from "node:test";
import { compareExactRgbaBuffers } from "../scripts/lib/exact-rgba-validation.mjs";
test("exact pixel comparator rejects any RGB/alpha change, length mismatch or non-buffer, without tolerances", () => {
  const reference = Buffer.from([1,2,3,255,4,5,6,128]);
  assert.equal(compareExactRgbaBuffers(Buffer.from(reference), reference, 8).equal, true);
  for (let offset = 0; offset < reference.length; offset++) {
    const changed = Buffer.from(reference); changed[offset] ^= 1; assert.equal(compareExactRgbaBuffers(changed, reference, 8).equal, false);
  }
  assert.equal(compareExactRgbaBuffers(reference.subarray(0,4), reference, 8).equal, false);
  assert.equal(compareExactRgbaBuffers(reference, reference.subarray(0,4), 8).equal, false);
  assert.throws(() => compareExactRgbaBuffers(new Uint8Array(8), reference, 8), TypeError);
  for (const bytes of [0,-4,3,4.5,Infinity,32 * 1048576 + 4]) assert.throws(() => compareExactRgbaBuffers(reference, reference, bytes), RangeError);
});
test("full 3840x2160 RGBA buffers compare exactly without a per-byte assertion object graph", () => {
  const bytes = 3840 * 2160 * 4, actual = Buffer.alloc(bytes, 127), reference = Buffer.from(actual);
  const result = compareExactRgbaBuffers(actual, reference, bytes);
  assert.equal(result.equal, true); assert.equal(result.expectedBytes, 33177600); assert.ok(result.comparisonMs >= 0);
  actual[bytes - 1] ^= 1; assert.equal(compareExactRgbaBuffers(actual, reference, bytes).equal, false);
});
