import assert from "node:assert/strict";
import test from "node:test";
import { readMpeg2SplitPacket, createMpeg2SplitPacketDrain } from "../scripts/lib/mpeg2-split-packet-bridge.mjs";

// Protocol units only: no FFmpeg, media input, encode or browser acceptance.
function fixture({ statuses = [1, 0], bytes = 4096, sides = [] } = {}) {
  const memory = new WebAssembly.Memory({ initial: 256, maximum: 256, shared: true });
  const core = { HEAPU8: new Uint8Array(memory.buffer) };
  const pointer = 1024, wire = new DataView(memory.buffer, pointer, 320);
  wire.setUint32(0, 1, true); wire.setUint32(4, bytes ? 4096 : 0, true); wire.setUint32(8, bytes, true);
  wire.setUint32(12, 1, true); wire.setBigInt64(16, (1n << 60n) + 9n, true);
  wire.setBigInt64(24, -(1n << 63n), true); wire.setBigInt64(32, (1n << 63n) - 1n, true);
  wire.setBigInt64(40, -1n, true); wire.setInt32(48, 1, true); wire.setInt32(52, 24, true);
  wire.setUint32(56, sides.length, true);
  sides.forEach(({ type, bytes: size }, i) => {
    const at = 64 + i * 16;
    wire.setUint32(at, type, true); wire.setUint32(at + 4, 2 * 1024 * 1024 + i * 65536, true);
    wire.setUint32(at + 8, size, true);
  });
  let receives = 0, releases = 0, held = false;
  core._within_split_encoder_next_packet = () => {
    assert.equal(held, false); receives++;
    const status = statuses[(receives - 1) % statuses.length]; held = status === 1; return status;
  };
  core._within_split_encoder_packet_record = () => { assert.ok(held); return pointer; };
  core._within_split_encoder_release_packet = () => { assert.ok(held); releases++; held = false; return 0; };
  return { core, memory, pointer, wire, receives: () => receives, releases: () => releases };
}

test("packet ABI borrows native storage without truncating int64 timestamps or copying payload", () => {
  const f = fixture({ sides: [{ type: 1, bytes: 13 }, { type: 8, bytes: 8 }, { type: 10, bytes: 40 }] });
  const p = readMpeg2SplitPacket(f.core, f.pointer);
  assert.equal(p.pts, (1n << 60n) + 9n); assert.equal(p.dts, -(1n << 63n));
  assert.equal(p.duration, (1n << 63n) - 1n); assert.equal(p.position, -1n);
  assert.equal(p.sideBytes, 61); assert.equal(p.bytes, 4096);
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.sides) && p.sides.every(Object.isFrozen));
  assert.ok(Object.values(p).every(value => !ArrayBuffer.isView(value)));
  assert.throws(() => f.memory.grow(1), RangeError);
  const empty = fixture({ bytes: 0, sides: [{ type: 1, bytes: 1 }] });
  assert.equal(readMpeg2SplitPacket(empty.core, empty.pointer).bytes, 0);
});

test("packet reader rejects malformed ABI, backing, budgets, clocks, side types and unused descriptors", () => {
  for (const [offset, value] of [[0, 2], [4, 16777215], [8, 1048577], [12, 8], [12, 32],
    [48, 0], [52, 0xffffffff], [56, 17], [60, 1], [64, 1]]) {
    const f = fixture(); f.wire.setUint32(offset, value, true);
    assert.throws(() => readMpeg2SplitPacket(f.core, f.pointer));
  }
  for (const side of [{ type: 0, bytes: 1024 }, { type: 10, bytes: 39 }, { type: 8, bytes: 7 },
    { type: 1, bytes: 0 }, { type: 1, bytes: 65537 }]) {
    const f = fixture({ sides: [side] }); assert.throws(() => readMpeg2SplitPacket(f.core, f.pointer));
  }
  const total = fixture({ sides: [{ type: 1, bytes: 65536 }, { type: 1, bytes: 1 }] });
  assert.throws(() => readMpeg2SplitPacket(total.core, total.pointer));
  const f = fixture();
  for (const pointer of [0, -1, 1, 1.5, 16777216 - 316]) assert.throws(() => readMpeg2SplitPacket(f.core, pointer));
  assert.throws(() => readMpeg2SplitPacket({ HEAPU8: f.core.HEAPU8.subarray(4) }, f.pointer));
});

test("one native packet remains held until asynchronous mux consumption finishes", async () => {
  const f = fixture(); let unblock;
  const gate = new Promise(resolve => { unblock = resolve; });
  const drain = createMpeg2SplitPacketDrain({ encoder: f.core, isCancelled: () => false,
    consume: async () => { assert.equal(f.releases(), 0); await gate; } });
  const job = drain.drain();
  assert.equal(f.receives(), 1); assert.equal(f.releases(), 0); assert.equal(drain.metrics().activePackets, 1);
  await assert.rejects(drain.drain(), /active/); assert.throws(() => drain.close(), /active/);
  unblock(); assert.equal(await job, "needs-input");
  assert.equal(f.receives(), 2); assert.equal(f.releases(), 1);
  assert.equal(drain.metrics().completedPackets, 1); assert.equal(drain.metrics().queuedPackets, 0);
  assert.equal(drain.metrics().additionalPacketBufferBytes, 0); assert.equal(drain.metrics().failed, false);
  drain.close(); await assert.rejects(drain.drain(), /closed/);
});

test("100 handoffs retain scalar counters only, followed by exact flush EOF", async () => {
  const f = fixture(); let consumed = 0;
  const drain = createMpeg2SplitPacketDrain({ encoder: f.core, isCancelled: () => false,
    consume: () => { consumed++; } });
  for (let i = 0; i < 100; i++) assert.equal(await drain.drain(), "needs-input");
  assert.equal(consumed, 100); assert.equal(f.releases(), 100);
  f.core._within_split_encoder_next_packet = () => 2;
  assert.equal(await drain.drain({ flushing: true }), "eof");
  const m = drain.close(); assert.equal(m.observedBytes, 409600); assert.equal(m.completedPackets, 100);
  assert.equal(m.activePackets, 0); assert.equal(m.peakPacketBytes, 4096);
});

test("decode errors, malformed packets and phase mismatches poison the drain instead of retrying partial mux writes", async () => {
  for (const status of [-12, 2]) {
    const f = fixture({ statuses: [status] });
    const drain = createMpeg2SplitPacketDrain({ encoder: f.core, consume: () => assert.fail(), isCancelled: () => false });
    await assert.rejects(drain.drain()); assert.equal(f.releases(), 0); assert.equal(drain.metrics().failed, true);
    await assert.rejects(drain.drain(), /failed/); drain.close();
  }
  const f = fixture(); f.wire.setUint32(0, 2, true);
  const drain = createMpeg2SplitPacketDrain({ encoder: f.core, consume: () => assert.fail(), isCancelled: () => false });
  await assert.rejects(drain.drain(), /ABI/); assert.equal(f.releases(), 1); assert.equal(drain.metrics().observedPackets, 0);
  drain.close();
  const flushing = fixture({ statuses: [0] });
  const wrong = createMpeg2SplitPacketDrain({ encoder: flushing.core, consume: () => {}, isCancelled: () => false });
  await assert.rejects(wrong.drain({ flushing: true }), /phase/); wrong.close();
});

test("cancellation before admission and during consumer await releases exactly the owned packet", async () => {
  for (const early of [true, false]) {
    const f = fixture(); let cancel = early;
    const drain = createMpeg2SplitPacketDrain({ encoder: f.core, isCancelled: () => cancel, consume: async () => { cancel = true; } });
    await assert.rejects(drain.drain(), /cancelled/);
    assert.equal(f.releases(), early ? 0 : 1); assert.equal(f.receives(), early ? 0 : 1);
    assert.equal(drain.metrics().completedPackets, 0); assert.equal(drain.metrics().activePackets, 0);
    assert.equal(drain.metrics().failed, true); drain.close();
  }
});

test("heap replacement and consumer/release failures preserve errors and prevent further admission", async () => {
  const f = fixture(); const first = new Error("destination failed");
  f.core._within_split_encoder_release_packet = () => -12;
  const drain = createMpeg2SplitPacketDrain({ encoder: f.core, isCancelled: () => false, consume: () => { throw first; } });
  await assert.rejects(drain.drain(), error => error instanceof AggregateError && error.errors[0] === first && /release/.test(error.errors[1].message));
  assert.equal(drain.metrics().observedPackets, 1); assert.equal(drain.metrics().completedPackets, 0);
  await assert.rejects(drain.drain(), /failed/); drain.close();
  const swapped = fixture();
  const owner = createMpeg2SplitPacketDrain({ encoder: swapped.core, isCancelled: () => false,
    consume: async () => { swapped.core.HEAPU8 = new Uint8Array(new WebAssembly.Memory({ initial: 256, maximum: 256, shared: true }).buffer); } });
  await assert.rejects(owner.drain(), /heap changed/); assert.equal(swapped.releases(), 1); owner.close();
});
