// Mock-only boundary/lifetime checks. No browser, codec, speed or memory acceptance.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createWebCodecsVp9Bridge, WEBCODECS_VP9_LIMITS } from "../workers/webcodecs-vp9-bridge.mjs";

function harness(mode = "normal", signal, isCancelled) {
  const heap = new Uint8Array(WEBCODECS_VP9_LIMITS.heapBytes), config = new DataView(heap.buffer, 128, 96);
  [1, 4, 4, 1, 24, 24, 1, 600000, 120, 1, 1, 1, 1, 1, 1].forEach((x, i) => config.setUint32(i * 4, x, true));
  const wire = new DataView(heap.buffer, 256, 80);
  [1, 4, 4, 0].forEach((x, i) => wire.setUint32(i * 4, x, true));
  const planes = [[1024, 8, 1024, 32, 4, 4], [2048, 4, 2048, 8, 2, 2], [3076, -4, 3072, 8, 2, 2]];
  const expected = []; let value = 1;
  for (let i = 0; i < 3; i++) {
    const [start, stride, base, bytes, rowBytes, rows] = planes[i];
    [start, stride, base, bytes].forEach((x, j) => wire.setInt32(16 + 16 * i + 4 * j, x, true));
    for (let row = 0; row < rows; row++) for (let col = 0; col < rowBytes; col++) {
      heap[start + stride * row + col] = value; expected.push(value++);
    }
  }
  wire.setBigInt64(64, 2n, true); wire.setUint32(72, 1, true); wire.setUint32(76, 1, true);
  const state = { configured: 0, closed: 0, frameClosed: 0, liveFrames: 0, copiedTo: null, captured: null, instance: null };
  class Frame {
    constructor(data, options) { state.captured = { bytes: [...data], options }; state.liveFrames++; this.closed = false; }
    close() { assert.equal(this.closed, false); this.closed = true; state.frameClosed++; state.liveFrames--; }
  }
  class Encoder {
    static async isConfigSupported(candidate) {
      if (mode === "unsupported") return { supported: false, config: candidate };
      const config = { ...candidate }; if (mode === "stripped") delete config.hardwareAcceleration;
      return { supported: true, config };
    }
    constructor(callbacks) { this.callbacks = callbacks; this.state = "unconfigured"; this.encodeQueueSize = 0; state.instance = this; }
    configure() { state.configured++; this.state = "configured"; }
    encode(frame) { if (mode === "encode-error") throw new Error("injected encode failure"); assert.equal(frame.closed, false); }
    async flush() {
      assert.equal(state.liveFrames, 0, "VideoFrame must be closed before awaiting flush");
      if (mode === "blocked") return new Promise((resolve, reject) => { this.reject = reject; this.release = resolve; });
      const chunk = { byteLength: mode === "oversize" ? 1048577 : 3,
        timestamp: state.captured.options.timestamp + (mode === "timestamp" ? 1 : 0), type: mode === "missing-key" ? "delta" : "key",
        copyTo(target) { state.copiedTo = target; if (mode === "copy-error") throw new Error("injected copy failure"); target.set([7, 8, 9]); } };
      if (mode === "codec-error") this.callbacks.error(new Error("injected codec failure"));
      else if (mode !== "no-output") this.callbacks.output(chunk, mode === "description" ? { decoderConfig: { description: new Uint8Array(2) } } : {});
      if (mode === "duplicate") this.callbacks.output(chunk, {});
    }
    close() { assert.notEqual(this.state, "closed"); state.closed++; this.state = "closed"; this.reject?.(new DOMException("Closed", "AbortError")); }
  }
  const bridge = createWebCodecsVp9Bridge({ Encoder, Frame, signal, isCancelled });
  return { heap, config, wire, state, expected, bridge };
}
function released(h) {
  const value = h.bridge.snapshot(); assert.equal(value.closed, true); assert.equal(value.currentPackedBytes, 0);
  assert.equal(value.pendingPacketBytes, 0); assert.equal(value.busy, false); assert.equal(h.state.liveFrames, 0);
  assert.equal(value.acceptanceMetric, false); assert.equal(value.physicalHardwareSelectionProven, false);
}
test("private VP9 packs padded and negative-stride planes, closes frames, and copies directly into native packet", async () => {
  const h = harness(), before = h.heap.slice(1024, 3080);
  try {
    assert.equal(await h.bridge.open(h.heap, 128), 0); assert.equal(await h.bridge.encode(h.heap, 256), 3);
    assert.deepEqual(h.state.captured.bytes, h.expected); assert.equal(h.state.captured.options.timestamp, 83333);
    assert.equal(h.state.captured.options.duration, 41667); assert.deepEqual(h.state.captured.options.colorSpace,
      { primaries: "bt709", transfer: "bt709", matrix: "bt709", fullRange: false });
    assert.equal(h.bridge.copy(h.heap, 8192, 3), 1); assert.equal(h.state.copiedTo.buffer, h.heap.buffer);
    assert.deepEqual([...h.heap.subarray(8192, 8195)], [7, 8, 9]); assert.deepEqual(h.heap.slice(1024, 3080), before);
    h.wire.setBigInt64(64, 3n, true); assert.equal(await h.bridge.encode(h.heap, 256), 3); h.bridge.copy(h.heap, 8192, 3);
    assert.equal(h.bridge.snapshot().frames, 2); assert.equal(h.bridge.snapshot().packets, 2);
    assert.equal(h.bridge.snapshot().peakPackedBytes, 24); assert.equal(h.bridge.snapshot().peakPacketBytes, 3);
  } finally { h.bridge.close(); h.bridge.close(); }
  released(h); assert.equal(h.state.closed, 1); assert.equal(h.state.frameClosed, 2);
});
for (const mode of ["unsupported", "stripped"]) test("VP9 rejects unsupported/altered exact configuration: " + mode, async () => {
  const h = harness(mode); await assert.rejects(h.bridge.open(h.heap, 128)); released(h); assert.equal(h.state.configured, 0);
});
for (const [at, value] of [[0, 2], [4, 1922], [8, 1082], [12, 0], [20, 25], [28, 0], [36, 9], [40, 16], [44, 9], [48, 2]])
  test(`VP9 configuration fails closed at ${at}=${value}`, async () => {
    const h = harness(); h.config.setUint32(at, value, true); await assert.rejects(h.bridge.open(h.heap, 128)); released(h);
    assert.equal(h.state.configured, 0);
  });
for (const mode of ["oversize", "timestamp", "missing-key", "description", "no-output", "duplicate", "encode-error", "codec-error"])
  test("VP9 releases one-frame handoff after encoder fault: " + mode, async () => {
    const h = harness(mode); await h.bridge.open(h.heap, 128); await assert.rejects(h.bridge.encode(h.heap, 256));
    released(h); assert.equal(h.state.closed, 1); assert.equal(h.state.frameClosed, 1);
  });
for (const [at, value] of [[0, 2], [12, 1], [20, 1], [24, 1030], [28, 2], [32, 1024], [72, 2], [76, 0]])
  test(`VP9 rejects malformed/aliased native frame at ${at}=${value}`, async () => {
    const h = harness(); await h.bridge.open(h.heap, 128); h.wire.setUint32(at, value, true);
    const before = h.heap.slice(1024, 3080); await assert.rejects(h.bridge.encode(h.heap, 256));
    assert.deepEqual(h.heap.slice(1024, 3080), before); released(h); assert.equal(h.state.frameClosed, 0);
  });
test("VP9 refuses a second frame until native code consumes the packet", async () => {
  const h = harness(); try {
    await h.bridge.open(h.heap, 128); await h.bridge.encode(h.heap, 256);
    await assert.rejects(h.bridge.encode(h.heap, 256), /consumed packet/); assert.equal(h.bridge.snapshot().pendingPacketBytes, 3);
    h.bridge.copy(h.heap, 8192, 3); assert.equal(h.bridge.snapshot().packets, 1);
  } finally { h.bridge.close(); } released(h);
});
test("VP9 abort closes in-flight encoder, rejects pending flush, and drops owned references", async () => {
  const controller = new AbortController(), h = harness("blocked", controller.signal);
  await h.bridge.open(h.heap, 128); const encoding = h.bridge.encode(h.heap, 256);
  await assert.rejects(h.bridge.encode(h.heap, 256), /idle encoder/);
  controller.abort(); await assert.rejects(encoding, { name: "AbortError" }); released(h); assert.equal(h.state.closed, 1);
});
for (const mode of ["bounds", "length", "copy-error"]) test("VP9 native copy failure releases pending chunk: " + mode, async () => {
  const h = harness(mode); await h.bridge.open(h.heap, 128); await h.bridge.encode(h.heap, 256);
  assert.throws(() => h.bridge.copy(h.heap, mode === "bounds" ? h.heap.length - 1 : 8192, mode === "length" ? 2 : 3)); released(h);
});
test("VP9 rejects missing WebCodecs without claiming a working fallback", async () => {
  const h = harness(), bridge = createWebCodecsVp9Bridge({ Encoder: null, Frame: null });
  await assert.rejects(bridge.open(h.heap, 128), { name: "NotSupportedError" }); assert.equal(bridge.snapshot().closed, true); h.bridge.close();
});
test("VP9 observes the production cancellation callback between native operations", async () => {
  let cancelled = false; const h = harness("normal", undefined, () => cancelled);
  await h.bridge.open(h.heap, 128); cancelled = true;
  await assert.rejects(h.bridge.encode(h.heap, 256), { name: "AbortError" }); released(h);
});
