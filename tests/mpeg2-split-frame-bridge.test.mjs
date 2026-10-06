import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  copyMpeg2SplitPixels, createMpeg2SplitFrameBridge,
  MPEG2_SPLIT_DECODER_BYTES, MPEG2_SPLIT_ENCODER_BYTES, MPEG2_SPLIT_MAX_FRAME_BYTES,
} from "../scripts/lib/mpeg2-split-frame-bridge.mjs";

const decoderMemory = new WebAssembly.Memory({ initial: 512, maximum: 512, shared: true });
const encoderMemory = new WebAssembly.Memory({ initial: 256, maximum: 256, shared: true });
const decoder = { HEAPU8: new Uint8Array(decoderMemory.buffer) };
const encoder = { HEAPU8: new Uint8Array(encoderMemory.buffer) };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function layout(width = 16, height = 8, pixelFormat = "yuv420p", padding = 0, negative = false) {
  let cursor = 256;
  return { width, height, pixelFormat, planes: [0, 1, 2].map((index) => {
    const rowBytes = index ? width / 2 : width;
    const rows = !index || pixelFormat === "yuv422p" ? height : height / 2;
    const stride = rowBytes + padding, allocationBytes = stride * rows + 64;
    const plane = { allocationOffset: cursor, allocationBytes,
      offset: cursor + (negative ? (rows - 1) * stride : 0), stride: negative ? -stride : stride };
    cursor += allocationBytes + 64; return plane;
  }) };
}
function fill(core, frame) {
  frame.planes.forEach((plane, index) => {
    const rowBytes = index ? frame.width / 2 : frame.width;
    const rows = !index || frame.pixelFormat === "yuv422p" ? frame.height : frame.height / 2;
    for (let row = 0; row < rows; row++)
      for (let x = 0; x < rowBytes; x++) core.HEAPU8[plane.offset + row * plane.stride + x] = (row * 13 + x * 7 + index * 31) & 255;
  });
}
function activeHash(core, frame) {
  const digest = createHash("sha256");
  frame.planes.forEach((plane, index) => {
    const rowBytes = index ? frame.width / 2 : frame.width;
    const rows = !index || frame.pixelFormat === "yuv422p" ? frame.height : frame.height / 2;
    for (let row = 0; row < rows; row++) {
      const start = plane.offset + row * plane.stride;
      digest.update(core.HEAPU8.subarray(start, start + rowBytes));
    }
  });
  return digest.digest("hex");
}
const copy = (source, target) => copyMpeg2SplitPixels(decoder, encoder, source, target);
const clone = (value) => structuredClone(value);
function bridge(overrides = {}) {
  return createMpeg2SplitFrameBridge({ decoder, encoder, prepare: () => layout(), consume: () => {},
    release: () => {}, isCancelled: () => false, ...overrides });
}

test("Original 1920x804 pixels cross separate fixed heaps unchanged, without copying encoder padding", () => {
  assert.equal(decoderMemory.buffer.byteLength, MPEG2_SPLIT_DECODER_BYTES);
  assert.equal(encoderMemory.buffer.byteLength, MPEG2_SPLIT_ENCODER_BYTES);
  assert.throws(() => decoderMemory.grow(1), RangeError); assert.throws(() => encoderMemory.grow(1), RangeError);
  const source = layout(1920, 804, "yuv420p", 0), target = layout(1920, 804, "yuv420p", 32);
  decoder.HEAPU8.fill(19); encoder.HEAPU8.fill(165); fill(decoder, source);
  const before = hash(decoder.HEAPU8);
  assert.equal(copy(source, target), 2315520); assert.equal(hash(decoder.HEAPU8), before);
  assert.equal(activeHash(decoder, source), activeHash(encoder, target));
  target.planes.forEach((plane, index) => {
    const rowBytes = index ? 960 : 1920, rows = index ? 402 : 804;
    for (let row = 0; row < rows; row++)
      assert.ok(encoder.HEAPU8.subarray(plane.offset + row * plane.stride + rowBytes,
        plane.offset + (row + 1) * plane.stride).every((value) => value === 165));
    assert.equal(encoder.HEAPU8[plane.allocationOffset + plane.allocationBytes - 1], 165);
  });
  assert.equal(encoder.HEAPU8[0], 165);
});
test("Contiguous, padded, negative source/target strides and YUV422 preserve all active bytes", () => {
  for (const format of ["yuv420p", "yuv422p"]) {
    for (const [fromPadding, toPadding, fromNegative, toNegative] of
      [[0, 0, false, false], [7, 11, false, false], [9, 8, true, false], [8, 9, false, true], [7, 7, true, true]]) {
      const source = layout(18, 10, format, fromPadding, fromNegative);
      const target = layout(18, 10, format, toPadding, toNegative);
      fill(decoder, source); assert.equal(copy(source, target), format === "yuv420p" ? 270 : 360);
      assert.equal(activeHash(decoder, source), activeHash(encoder, target));
    }
  }
});
test("All plane bounds and shape are checked before any target write; unsupported shapes are never resized", () => {
  const source = layout(), target = layout();
  const cases = [];
  for (const mutate of [
    (v) => { v.planes[2].allocationBytes = 1; },
    (v) => { v.planes[1].allocationOffset = MPEG2_SPLIT_ENCODER_BYTES - 1; },
    (v) => { v.planes[2].offset = -1; }, (v) => { v.planes[0].stride = 1; },
    (v) => { v.planes[0].stride = -v.planes[0].stride; },
    (v) => { v.planes[0].allocationBytes = Number.MAX_SAFE_INTEGER; },
    (v) => { v.planes[2] = { ...v.planes[0] }; }, (v) => { v.width = 15; },
    (v) => { v.height = 2162; }, (v) => { v.pixelFormat = "rgba"; },
    (v) => { v.planes.push({ ...v.planes[0] }); }, (v) => { v.hiddenCrop = 2; },
    (v) => { v.planes[0].unownedAddress = 99; },
  ]) { const value = clone(target); mutate(value); cases.push(value); }
  const before = hash(encoder.HEAPU8);
  for (const invalid of cases) { assert.throws(() => copy(source, invalid)); assert.equal(hash(encoder.HEAPU8), before); }
  assert.throws(() => copy(source, layout(18, 8)), /cannot change/);
  assert.throws(() => copy(source, layout(16, 8, "yuv422p")), /cannot change/);
  assert.throws(() => copyMpeg2SplitPixels(decoder, decoder, source, target), /fixed-size/);
  assert.throws(() => copyMpeg2SplitPixels({ HEAPU8: decoder.HEAPU8.subarray(1) }, encoder, source, target), /fixed-size/);
  assert.throws(() => copy(layout(4096, 2160, "yuv422p"), layout(4096, 2160, "yuv422p")), /backing allocation/);
  assert.equal(MPEG2_SPLIT_MAX_FRAME_BYTES, 17694720);
});
test("Exactly one frame is owned through asynchronous encoder backpressure; no second frame or early close", async () => {
  let resume, released = 0, prepared = 0;
  const pause = new Promise((resolve) => { resume = resolve; });
  const value = bridge({ prepare: () => { prepared++; return layout(); },
    consume: () => pause, release: () => { released++; } });
  fill(decoder, layout()); const pending = value.send(layout());
  await Promise.resolve(); await Promise.resolve();
  assert.equal(value.metrics().activeFrames, 1); assert.equal(value.metrics().queuedFrames, 0);
  await assert.rejects(value.send(layout()), /already active/); assert.throws(() => value.close(), /active frame/);
  assert.equal(prepared, 1); assert.equal(released, 0); resume(); await pending;
  assert.equal(released, 1); assert.equal(value.metrics().activeFrames, 0);
  assert.equal(value.metrics().completedFrames, 1); assert.equal(value.metrics().copiedFrames, 1);
  assert.equal(value.metrics().copiedBytes, 192); assert.equal(value.metrics().additionalPixelBufferBytes, 0);
  assert.equal(value.metrics().peakActiveFrames, 1); value.close();
  await assert.rejects(value.send(layout()), /closed/);
});
test("Cancellation, prepare/consume failures, and release failure clear ownership without hiding causes", async () => {
  let cancelled = false, released = 0;
  const before = bridge({ isCancelled: () => true });
  await assert.rejects(before.send(layout()), /cancelled/); assert.equal(before.metrics().peakActiveFrames, 0); before.close();
  const during = bridge({ isCancelled: () => cancelled,
    prepare: () => { cancelled = true; return layout(); }, release: () => { released++; } });
  await assert.rejects(during.send(layout()), /cancelled/); assert.equal(released, 1);
  assert.equal(during.metrics().activeFrames, 0); assert.equal(during.metrics().copiedBytes, 0);
  assert.equal(during.metrics().peakActiveFrames, 1); during.close();
  const prepareFailure = new Error("prepare failed"), consumeFailure = new Error("encode failed"), releaseFailure = new Error("release failed");
  const failedPrepare = bridge({ prepare: () => { throw prepareFailure; }, release: () => { released++; } });
  await assert.rejects(failedPrepare.send(layout()), (error) => error === prepareFailure);
  assert.equal(released, 1); failedPrepare.close();
  const failedConsume = bridge({ consume: () => { throw consumeFailure; }, release: () => { released++; } });
  await assert.rejects(failedConsume.send(layout()), (error) => error === consumeFailure);
  assert.equal(released, 2); assert.equal(failedConsume.metrics().copiedBytes, 192);
  assert.equal(failedConsume.metrics().completedFrames, 0); failedConsume.close();
  const both = bridge({ consume: () => { throw consumeFailure; }, release: () => { throw releaseFailure; } });
  await assert.rejects(both.send(layout()), (error) => error instanceof AggregateError
    && error.errors[0] === consumeFailure && error.errors[1] === releaseFailure);
  assert.equal(both.metrics().activeFrames, 0); both.close();
  const onlyRelease = bridge({ release: () => { throw releaseFailure; } });
  await assert.rejects(onlyRelease.send(layout()), (error) => error === releaseFailure);
  assert.equal(onlyRelease.metrics().activeFrames, 0); onlyRelease.close();
});
test("Borrowed layout mutation and heap replacement across awaits cannot redirect native pixel access", async () => {
  const original = layout(); let releaseCount = 0;
  const value = bridge({ prepare: (metadata) => {
    assert.ok(Object.isFrozen(metadata)); assert.deepEqual(Object.keys(metadata).sort(), ["height", "pixelFormat", "width"]);
    original.planes[0].offset = -1; return layout();
  } });
  await value.send(original); value.close();
  const replacement = { HEAPU8: encoder.HEAPU8 };
  const changed = bridge({ encoder: replacement, prepare: () => {
    replacement.HEAPU8 = new Uint8Array(new SharedArrayBuffer(MPEG2_SPLIT_ENCODER_BYTES)); return layout();
  }, release: () => { releaseCount++; } });
  await assert.rejects(changed.send(layout()), /heap changed/); assert.equal(releaseCount, 1);
  assert.equal(changed.metrics().copiedBytes, 0); changed.close();
});
test("Repeated sends retain only scalar metrics, not a history of frames or media data", async () => {
  const value = bridge();
  for (let index = 0; index < 100; index++) await value.send(layout());
  const metrics = value.close(); assert.equal(metrics.completedFrames, 100);
  assert.equal(metrics.copiedBytes, 19200); assert.equal(metrics.peakFrameBytes, 192);
  assert.equal(metrics.activeFrames, 0); assert.equal(metrics.queuedFrames, 0); assert.equal(metrics.closed, true);
  assert.ok(Object.values(metrics).every((v) => ["number", "string", "boolean"].includes(typeof v)));
});
test("Private handoff source has no third pixel buffer, media array, global mutable state or platform conversion helper", async () => {
  const source = await readFile(new URL("../scripts/lib/mpeg2-split-frame-bridge.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /node:|new (?:Uint8Array|ArrayBuffer|SharedArrayBuffer)|Blob\(|arrayBuffer\(|MEMFS|fetch\(|postMessage\(|console\./);
  assert.match(source, /targetHeap\.set\(sourceHeap\.subarray/);
  assert.match(source, /await consume\(\)/); assert.match(source, /await release\(\)/);
  assert.match(source, /decoder = null; encoder = null/); assert.match(source, /no frame queue allowed/);
  assert.match(source, /all frame properties\/side data/); assert.match(source, /NOT a converter or fidelity certificate/);
});
