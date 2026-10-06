import assert from "node:assert/strict";
import test from "node:test";
import { inspectDlmallocFreeHeaders } from "../scripts/lib/dlmalloc-free-header-inspection.mjs";
const fixture = () => {
  const heap = new Uint8Array(4096), view = new DataView(heap.buffer), set = (at, value) => view.setUint32(at, value, true), root = 64;
  set(root + 12, 1024); set(root + 16, 1024); set(root + 24, 2048); set(2052, 1025);
  set(root + 432, 3072); set(root + 472, 1024); set(root + 476, 3072);
  return { heap, set, inspect: () => inspectDlmallocFreeHeaders(heap, { root, expectedBytes: 4096 }) };
};
test("Header inventory reads only free metadata, preserves input and includes top/dv", () => {
  const { heap, set, inspect } = fixture(); set(64 + 8, 256); set(64 + 20, 1024); set(1028, 257);
  const before = heap.slice(), result = inspect();
  assert.equal(result.totalFreeChunkBytes, 1280); assert.equal(result.largestFreeChunkBytes, 1024); assert.equal(result.freeChunks, 2);
  assert.deepEqual(heap, before); assert.equal(result.heapCopied, false); assert.equal(result.payloadRead, false);
  assert.equal(result.liveFrameCount, null); assert.equal(result.fragmentationCauseProven, false);
});
test("Smallbin and tree sibling entries are counted once; inconsistent metadata fails closed", () => {
  const { set, inspect } = fixture(), root = 64, sentinel = root + 40 + 4 * 8;
  set(root, 1 << 4); set(sentinel + 8, 1024); set(sentinel + 12, 1024); set(1028, 33); set(1032, sentinel); set(1036, sentinel);
  set(root + 4, 1); set(root + 304, 1280);
  for (const address of [1280, 1536]) { set(address + 4, 257); set(address + 28, 0); }
  set(1288, 1536); set(1292, 1536); set(1304, root + 304); set(1544, 1280); set(1548, 1280);
  const result = inspect(); assert.equal(result.totalFreeChunkBytes, 1568); assert.equal(result.freeChunks, 4);
  set(1548, 1536); assert.throws(inspect, /sibling linkage/);
});
test("Live chunks, duplicated free references and unsupported segments are unavailable, never zero", () => {
  const first = fixture(); first.set(2052, 1027); assert.throws(first.inspect, /state inconsistent/);
  const second = fixture(); second.set(64 + 8, 1024); second.set(64 + 20, 2048); assert.throws(second.inspect, /cycle inconsistent/);
  const third = fixture(); third.set(64 + 480, 3072); assert.throws(third.inspect, /segment unavailable/);
});
