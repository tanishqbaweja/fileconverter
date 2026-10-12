import assert from "node:assert/strict";
import test from "node:test";
import { scanProductionInput } from "../scripts/lib/bounded-production-input-scan.mjs";
test("full >2GiB scalar positions, final short chunk and seeks use one fixed buffer/one active read", async () => {
  const inputSize = 2958573265; let backing, active = 0, peak = 0, calls = 0, sequentialPosition = 0;
  const result = await scanProductionInput({ inputSize, read: async (offset, buffer) => {
    if (!backing) backing = buffer.buffer;
    assert.equal(buffer.buffer, backing); assert.equal(backing.byteLength, 65536); assert.ok(buffer.byteLength <= 65536);
    active++; peak = Math.max(peak, active); calls++;
    if (sequentialPosition < inputSize) { assert.equal(offset, sequentialPosition); sequentialPosition += buffer.byteLength; }
    await Promise.resolve(); active--; return buffer.byteLength;
  } });
  assert.equal(result.sequentialBytes, inputSize); assert.equal(result.sequentialReads, Math.ceil(inputSize / 65536));
  assert.deepEqual(result.seekOffsets, [2186655938, inputSize - 65536, 0]); assert.equal(result.seekReads, 3);
  assert.equal(calls, result.sequentialReads + 3); assert.equal(peak, 1);
  assert.equal(result.convertedBytes, 0); assert.equal(result.fullConversionAcceptance, false);
});
test("short successful bridge reads advance by actual count; exact exception propagates with no retry", async () => {
  const result = await scanProductionInput({ inputSize: 101, read: (_offset, buffer) => Math.min(7, buffer.byteLength) });
  assert.equal(result.sequentialBytes, 101); assert.equal(result.sequentialReads, 15); assert.equal(result.seekBytes, 101);
  const error = new Error("read failed"); let calls = 0;
  await assert.rejects(scanProductionInput({ inputSize: 100, read: () => { calls++; throw error; } }), value => value === error);
  assert.equal(calls, 1);
});
test("premature EOF and invalid counts rejected; browser serialization is self-contained", async () => {
  for (const count of [0, -1, 17, NaN, 1.5]) await assert.rejects(scanProductionInput({ inputSize: 16, read: () => count }), /premature EOF or invalid count/);
  const browserScan = (0, eval)(`(${scanProductionInput.toString()})`);
  const result = await browserScan({ inputSize: 1, read: () => 1, now: () => 3 });
  assert.equal(result.elapsedMs, 0); assert.equal(result.sequentialBytes, 1); assert.equal(result.seekBytes, 1);
  await assert.rejects(browserScan({ inputSize: 0, read() {} }), TypeError);
});
