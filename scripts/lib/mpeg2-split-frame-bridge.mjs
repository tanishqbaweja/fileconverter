// Private split-codec transport prototype, NOT a converter or fidelity certificate.
// Caller-owned native AVFrames supply allocation bounds from AVBufferRef. Pixels
// move directly between fixed Wasm heaps in the same conversion worker: no third
// frame buffer, frame queue, retained media view or unbounded output allocation.
// Codec configuration, all frame properties/side data, packet timestamps/muxing
// and native reference lifetimes are the owner's separate mandatory contracts.
// Owner MUST verify actual binary memory maxima before constructing the cores;
// this transport checks current sizes/identity, not a module's declared maximum.
export const MPEG2_SPLIT_DECODER_BYTES = 32 * 1024 * 1024;
export const MPEG2_SPLIT_ENCODER_BYTES = 16 * 1024 * 1024;
export const MPEG2_SPLIT_MAX_FRAME_BYTES = 4096 * 2160 * 2;

const check = (value, message) => { if (!value) throw new Error(message); };
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const exact = (value, keys) => {
  check(value !== null && typeof value === "object" && !Array.isArray(value), "Expected scalar layout object");
  check(Object.keys(value).sort().join("|") === keys.slice().sort().join("|"), "Unexpected pixel-layout fields");
};
function fixedHeap(core, bytes) {
  const heap = core?.HEAPU8;
  check(heap instanceof Uint8Array && heap.byteOffset === 0 && heap.byteLength === bytes
    && heap.buffer.byteLength === bytes, "Split core must expose its complete fixed-size Wasm heap");
  return heap;
}
function snapshotLayout(value, heapBytes) {
  exact(value, ["width", "height", "pixelFormat", "planes"]);
  const { width, height, pixelFormat } = value;
  check(integer(width, 2, 4096) && integer(height, 2, 2160) && !(width & 1) && !(height & 1),
    "Even bounded video dimensions required; never crop or resize implicitly");
  check(pixelFormat === "yuv420p" || pixelFormat === "yuv422p", "Only audited 8-bit planar YUV layouts");
  check(Array.isArray(value.planes) && value.planes.length === 3, "Exactly three native planes required");
  const spans = [];
  const planes = value.planes.map((plane, index) => {
    exact(plane, ["offset", "stride", "allocationOffset", "allocationBytes"]);
    const { offset, stride, allocationOffset, allocationBytes } = plane;
    const rowBytes = index === 0 ? width : width / 2;
    const rows = index === 0 || pixelFormat === "yuv422p" ? height : height / 2;
    check(integer(offset, 0, heapBytes - 1) && integer(stride, -heapBytes, heapBytes)
      && Math.abs(stride) >= rowBytes, "Invalid native plane pointer or stride");
    check(integer(allocationOffset, 0, heapBytes - 1) && integer(allocationBytes, 1, heapBytes)
      && allocationOffset + allocationBytes <= heapBytes, "Native backing allocation outside its heap");
    const last = offset + (rows - 1) * stride;
    const firstByte = Math.min(offset, last), endByte = Math.max(offset, last) + rowBytes;
    check(firstByte >= allocationOffset && endByte <= allocationOffset + allocationBytes,
      "Active plane rows exceed their actual native backing allocation");
    check(!spans.some(([start, end]) => firstByte < end && start < endByte), "Overlapping active plane spans");
    spans.push([firstByte, endByte]);
    return Object.freeze({ offset, stride, allocationOffset, allocationBytes, rowBytes, rows });
  });
  const frameBytes = planes.reduce((sum, plane) => sum + plane.rowBytes * plane.rows, 0);
  check(frameBytes <= MPEG2_SPLIT_MAX_FRAME_BYTES, "Frame exceeds the explicit transport budget");
  return Object.freeze({ width, height, pixelFormat, planes: Object.freeze(planes), frameBytes });
}
function copyValidated(sourceHeap, targetHeap, source, target) {
  check(source.width === target.width && source.height === target.height && source.pixelFormat === target.pixelFormat,
    "Split handoff cannot change dimensions or pixel format");
  // All three layouts are validated before the first write. Copy active pixels
  // only: never overwrite target padding with decoder padding or hidden bytes.
  for (let index = 0; index < 3; index++) {
    const from = source.planes[index], to = target.planes[index];
    if (from.stride === from.rowBytes && to.stride === to.rowBytes) {
      const bytes = from.rowBytes * from.rows;
      targetHeap.set(sourceHeap.subarray(from.offset, from.offset + bytes), to.offset);
    } else {
      for (let row = 0; row < from.rows; row++) {
        const start = from.offset + row * from.stride;
        targetHeap.set(sourceHeap.subarray(start, start + from.rowBytes), to.offset + row * to.stride);
      }
    }
  }
  return source.frameBytes;
}

// Synchronous low-level copy for a caller that already owns the frame lifetime.
export function copyMpeg2SplitPixels(decoder, encoder, source, destination) {
  const sourceHeap = fixedHeap(decoder, MPEG2_SPLIT_DECODER_BYTES);
  const targetHeap = fixedHeap(encoder, MPEG2_SPLIT_ENCODER_BYTES);
  check(sourceHeap.buffer !== targetHeap.buffer, "Independent split heaps required");
  return copyValidated(sourceHeap, targetHeap,
    snapshotLayout(source, sourceHeap.length), snapshotLayout(destination, targetHeap.length));
}

// A second frame is refused, not queued. The native decoder MUST await send()
// before obtaining another frame. prepare() acquires encoder-owned storage;
// consume() must await all encoding/packet backpressure; release() is normal
// owner cleanup, NEVER early release of the decoder's live reference set.
export function createMpeg2SplitFrameBridge(options) {
  let { decoder, encoder, prepare, consume, release, isCancelled } = options;
  for (const fn of [prepare, consume, release, isCancelled]) check(typeof fn === "function", "Required split ownership callback");
  let active = false, closed = false, frames = 0, copiedFrames = 0, copiedBytes = 0, peakFrameBytes = 0, peakActiveFrames = 0;
  const activeCheck = () => { check(!isCancelled(), "Split frame handoff cancelled"); };
  const metrics = () => Object.freeze({ scope: "private-pixel-transport-not-conversion-acceptance",
    decoderMemoryBytes: MPEG2_SPLIT_DECODER_BYTES, encoderMemoryBytes: MPEG2_SPLIT_ENCODER_BYTES,
    additionalPixelBufferBytes: 0, queuedFrames: 0, activeFrames: Number(active),
    peakActiveFrames, completedFrames: frames, copiedFrames, copiedBytes, peakFrameBytes, closed });
  return Object.freeze({
    async send(layout) {
      check(!closed, "Split frame bridge closed"); check(!active, "Split frame already active; no frame queue allowed");
      activeCheck(); active = true; peakActiveFrames = 1;
      let acquired = null, failure = null;
      try {
        const sourceHeap = fixedHeap(decoder, MPEG2_SPLIT_DECODER_BYTES);
        const targetHeap = fixedHeap(encoder, MPEG2_SPLIT_ENCODER_BYTES);
        check(sourceHeap.buffer !== targetHeap.buffer, "Independent split heaps required");
        const source = snapshotLayout(layout, sourceHeap.length);
        // A frozen scalar projection prevents mutation of the caller's layout
        // across prepare's await. No pixel objects are passed or retained here.
        const projected = Object.freeze({ width: source.width, height: source.height, pixelFormat: source.pixelFormat });
        acquired = await prepare(projected);
        activeCheck();
        check(fixedHeap(decoder, MPEG2_SPLIT_DECODER_BYTES).buffer === sourceHeap.buffer
          && fixedHeap(encoder, MPEG2_SPLIT_ENCODER_BYTES).buffer === targetHeap.buffer,
        "Native heap changed while a split frame was borrowed");
        const target = snapshotLayout(acquired, targetHeap.length);
        check(integer(copiedBytes + source.frameBytes, 0, Number.MAX_SAFE_INTEGER)
          && integer(copiedFrames + 1, 0, Number.MAX_SAFE_INTEGER)
          && integer(frames + 1, 0, Number.MAX_SAFE_INTEGER), "Split scalar counter overflow");
        const bytes = copyValidated(sourceHeap, targetHeap, source, target);
        peakFrameBytes = Math.max(peakFrameBytes, bytes); copiedFrames++; copiedBytes += bytes;
        activeCheck(); await consume(); activeCheck();
        check(fixedHeap(decoder, MPEG2_SPLIT_DECODER_BYTES).buffer === sourceHeap.buffer
          && fixedHeap(encoder, MPEG2_SPLIT_ENCODER_BYTES).buffer === targetHeap.buffer,
        "Native heap changed during encoder consumption");
        frames++;
      } catch (error) { failure = error; }
      finally {
        try { if (acquired !== null) await release(); }
        catch (error) { failure = failure ? new AggregateError([failure, error], "Split handoff and ownership cleanup failed") : error; }
        finally { acquired = null; active = false; }
      }
      if (failure) throw failure;
      return metrics();
    },
    metrics,
    close() {
      check(!active, "Cannot close while encoder owns an active frame");
      closed = true; decoder = null; encoder = null; prepare = null; consume = null; release = null; isCancelled = null;
      return metrics();
    },
  });
}
