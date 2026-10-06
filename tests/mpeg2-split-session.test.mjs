import assert from "node:assert/strict";
import test from "node:test";
import { createMpeg2SplitSession } from "../scripts/lib/mpeg2-split-session.mjs";
function fixture() {
  const heap = new Uint8Array(new WebAssembly.Memory({ initial: 512, maximum: 512, shared: true }).buffer);
  const encoder = { HEAPU8: new Uint8Array(new WebAssembly.Memory({ initial: 256, maximum: 256, shared: true }).buffer) };
  const wire = new DataView(encoder.HEAPU8.buffer, 4096, 320);
  wire.setUint32(0, 1, true); wire.setUint32(4, 8192, true); wire.setUint32(8, 32, true); wire.setUint32(12, 1, true);
  wire.setBigInt64(16, (1n << 60n) + 9n, true); wire.setBigInt64(24, -1n, true);
  wire.setBigInt64(32, 1n, true); wire.setBigInt64(40, -1n, true);
  wire.setUint32(48, 1, true); wire.setUint32(52, 24, true); wire.setUint32(56, 1, true);
  wire.setUint32(64, 10, true); wire.setUint32(68, 10000, true); wire.setUint32(72, 40, true);
  encoder.HEAPU8.fill(0xa5, 8192, 8224); encoder.HEAPU8.fill(0x37, 10000, 10040);
  encoder._within_split_encoder_config = () => 1024; encoder._within_split_encoder_parameters = () => 2048;
  encoder._within_split_encoder_parameter_bytes = () => 192;
  encoder._within_split_encoder_open = () => 0; encoder._within_split_encoder_settings_match = () => 1;
  let held = false, released = 0, closed = 0, eof = false;
  encoder._within_split_encoder_next_packet = () => { if (eof) return 2; assert.equal(held, false); held = true; return 1; };
  encoder._within_split_encoder_packet_record = () => 4096;
  encoder._within_split_encoder_release_packet = () => { assert.ok(held); held = false; released++; return 0; };
  encoder._within_split_encoder_flush = () => { eof = true; return 0; };
  encoder._within_split_encoder_close = () => { held = false; closed++; return 0; };
  let cancelled = false;
  const owner = createMpeg2SplitSession({ encoder, isCancelled: () => cancelled });
  assert.equal(owner.call(0, heap, 1024, 4096), 192);
  return { heap, encoder, wire, owner, releaseCount: () => released, closeCount: () => closed,
    cancel: () => { cancelled = true; } };
}
test("synchronous session clears foreign pointers and keeps a packet until native mux acknowledges completion", () => {
  const f = fixture(); assert.equal(f.owner.call(2, f.heap, 120000), 1);
  const target = new DataView(f.heap.buffer, 120000, 320);
  assert.equal(target.getUint32(4, true), 0); assert.equal(target.getUint32(68, true), 0);
  assert.equal(target.getBigInt64(16, true), (1n << 60n) + 9n);
  target.setUint32(4, 300000, true); target.setUint32(68, 310000, true);
  assert.equal(f.owner.call(3, f.heap, 120000), 0);
  assert.ok(f.heap.subarray(300000, 300032).every(x => x === 0xa5));
  assert.ok(f.heap.subarray(310000, 310040).every(x => x === 0x37));
  assert.equal(f.owner.metrics().activePackets, 1); assert.equal(f.releaseCount(), 0);
  assert.equal(f.owner.metrics().completedPackets, 0);
  assert.equal(f.owner.call(4, f.heap, 1), 0); assert.equal(f.releaseCount(), 1);
  assert.equal(f.owner.metrics().completedPackets, 1); assert.equal(f.owner.metrics().copiedPacketBytes, 32);
  assert.equal(f.owner.call(5, f.heap), 0); assert.equal(f.owner.call(2, f.heap, 120000), 2);
  assert.equal(f.owner.close(), 0); assert.equal(f.closeCount(), 1); f.owner.close(); assert.equal(f.closeCount(), 1);
});
test("native mux failure is released but not counted completed; malformed transfer cleans encoder in finally", () => {
  const f = fixture(); f.owner.call(2, f.heap, 120000); f.owner.call(4, f.heap, 0);
  assert.equal(f.owner.metrics().completedPackets, 0); f.owner.close();
  const bad = fixture(); bad.owner.call(2, bad.heap, 120000);
  const target = new DataView(bad.heap.buffer, 120000, 320);
  target.setUint32(4, 300000, true); target.setUint32(68, 33554430, true);
  assert.throws(() => bad.owner.call(3, bad.heap, 120000), /backing/);
  assert.ok(bad.heap.subarray(300000, 300032).every(x => x === 0));
  assert.equal(bad.owner.metrics().activePackets, 1); assert.equal(bad.owner.metrics().failed, true);
  bad.owner.close(); assert.equal(bad.owner.metrics().activePackets, 0); assert.equal(bad.closeCount(), 1);
});
test("held malformed packet, cancellation and release failure still permit codec-owner cleanup", () => {
  const bad = fixture(); bad.wire.setUint32(0, 2, true);
  assert.throws(() => bad.owner.call(2, bad.heap, 120000), /ABI/);
  assert.equal(bad.owner.metrics().activePackets, 1); bad.owner.close(); assert.equal(bad.owner.metrics().activePackets, 0);
  const cancelled = fixture(); cancelled.owner.call(2, cancelled.heap, 120000); cancelled.cancel();
  assert.throws(() => cancelled.owner.call(3, cancelled.heap, 120000), /cancelled/);
  assert.equal(cancelled.owner.call(4, cancelled.heap, 0), 0); assert.equal(cancelled.owner.metrics().completedPackets, 0);
  cancelled.owner.close(); assert.equal(cancelled.closeCount(), 1);
  const failed = fixture(); failed.owner.call(2, failed.heap, 120000);
  failed.encoder._within_split_encoder_release_packet = () => -12;
  assert.throws(() => failed.owner.call(4, failed.heap, 0), /release failed/);
  assert.equal(failed.owner.metrics().activePackets, null); failed.owner.close(); assert.equal(failed.owner.metrics().activePackets, 0);
});
