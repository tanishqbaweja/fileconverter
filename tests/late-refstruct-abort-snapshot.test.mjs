import assert from "node:assert/strict";
import test from "node:test";
import { readLateRefstructAbortSnapshot } from "../scripts/lib/late-refstruct-abort-snapshot.mjs";
function fixture() {
  const heap = new Uint8Array(33554432), address = 4096;
  const view = new DataView(heap.buffer, address, 64);
  const words = [0x52504631, 1, 106113, 1, 8192, 1163520, 16, 1163536, 5, 0, 0, 0x40000000, 4, 1, 0, 0];
  words.forEach((word, i) => view.setUint32(i * 4, word, true));
  const core = { HEAPU8: heap, withinRefstructAbortSnapshotAddress: address, withinRefstructAbortSnapshotWords: 16,
    _malloc() { throw new Error("Native calls forbidden"); } };
  return { core, view, words };
}
test("one synthetic pending request reads64 scalar bytes without touching/copying payload or native functions", () => {
  const { core, words } = fixture(), result = readLateRefstructAbortSnapshot(core);
  assert.equal(result.failedIndividualAllocationBytes, 1163536); assert.equal(result.payloadBytes, 1163520);
  assert.equal(result.liveEntriesBeforeRequest, 5); assert.equal(result.cachedEntriesInRequestedPoolBeforeRequest, 0);
  assert.equal(result.poolName, null); assert.equal(result.maximumScalarBytesRead, 64);
  assert.equal(result.payloadRead, false); assert.equal(result.heapCopied, false); assert.equal(result.nativeFunctionsCalled, false);
  assert.equal(result.publicAcceptance, false);
  const actual = new DataView(core.HEAPU8.buffer, 4096, 64);
  assert.deepEqual(Array.from({ length: 16 }, (_, i) => actual.getUint32(i * 4, true)), words);
});
test("missing, completed, malformed or inconsistent state is unavailable rather than invented zero", () => {
  assert.throws(() => readLateRefstructAbortSnapshot({}), /heap unavailable/);
  const { core, view } = fixture();
  for (const [index, bad] of [[0, 0], [1, 2], [2, 0], [3, 2], [3, 3], [6, 8], [7, 0], [7, 1163520],
    [9, 12288], [10, 1], [12, 8], [13, 0], [14, 1]]) {
    const prior = view.getUint32(index * 4, true); view.setUint32(index * 4, bad, true);
    assert.throws(() => readLateRefstructAbortSnapshot(core)); view.setUint32(index * 4, prior, true);
  }
  assert.throws(() => readLateRefstructAbortSnapshot({ ...core, withinRefstructAbortSnapshotAddress: -4 }));
  assert.throws(() => readLateRefstructAbortSnapshot({ ...core, withinRefstructAbortSnapshotWords: 32 }));
});
