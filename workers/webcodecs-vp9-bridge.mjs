// Private FFmpeg encoder adapter. No demux, mux, file I/O or public route selection here.
export const WEBCODECS_VP9_LIMITS = Object.freeze({ heapBytes: 33554432, maximumWidth: 1920,
  maximumHeight: 1080, maximumPacketBytes: 1048576, maximumPixels: 2073600 });
const requireValue = (condition, message) => { if (!condition) throw new Error(message); };
const unsupported = message => new DOMException(message, "NotSupportedError");
function view(heap, offset, bytes) {
  requireValue(heap instanceof Uint8Array && heap.buffer instanceof ArrayBuffer && heap.byteOffset === 0 && heap.byteLength === WEBCODECS_VP9_LIMITS.heapBytes &&
    heap.buffer.byteLength === heap.byteLength, "VP9 bridge requires the complete fixed32MiB native heap");
  requireValue(Number.isInteger(offset) && offset >= 0 && offset <= heap.byteLength - bytes, "Native descriptor is outside the fixed heap");
  return new DataView(heap.buffer, offset, bytes);
}
function colorSpace(wire) {
  const primaries = { 1: "bt709", 5: "bt470bg", 6: "smpte170m" }[wire.getUint32(36, true)];
  const transfer = { 1: "bt709", 6: "smpte170m" }[wire.getUint32(40, true)];
  const matrix = { 1: "bt709", 5: "bt470bg", 6: "smpte170m" }[wire.getUint32(44, true)];
  if (!primaries || !transfer || !matrix || wire.getUint32(48, true) !== 1)
    throw unsupported("This private VP9 candidate requires explicit supported SDR colorimetry and limited range; native CICP primaries/transfer/matrix/range=" +
      [36, 40, 44, 48].map(at => wire.getUint32(at, true)).join("/") + "; use the existing Wasm route otherwise");
  return { primaries, transfer, matrix, fullRange: false };
}
/** @param {{Encoder?: typeof VideoEncoder, Frame?: typeof VideoFrame, signal?: AbortSignal, isCancelled?: () => boolean}} [options] */
export function createWebCodecsVp9Bridge({ Encoder = globalThis.VideoEncoder, Frame = globalThis.VideoFrame, signal, isCancelled = () => false } = {}) {
  let encoder = null, config = null, colors = null, packed = null, pending = null, busy = false, closed = false, fault = null;
  let frames = 0, packets = 0, peakPackedBytes = 0, peakPacketBytes = 0, framesClosed = 0, expectedTimestamp = null, keyRequired = false;
  let supportProbeCount = 0, hardwarePreferredSupported = null, selectedHardwarePreference = null;
  const stop = error => {
    fault ??= error; pending = null; packed = null;
    signal?.removeEventListener("abort", cancel);
    if (encoder && encoder.state !== "closed") { try { encoder.close(); } catch { /* Preserve first codec/cancellation failure. */ } }
    encoder = null; config = null; colors = null; closed = true;
  };
  const cancel = () => stop(new DOMException("Conversion cancelled", "AbortError"));
  signal?.addEventListener("abort", cancel, { once: true });
  const active = () => { if (signal?.aborted || isCancelled()) cancel(); if (fault) throw fault; requireValue(!closed, "VP9 bridge is closed"); };
  return {
    async open(heap, offset) {
      active(); requireValue(!encoder && !config && !busy, "VP9 bridge may open only once"); busy = true;
      try {
        if (typeof Encoder !== "function" || typeof Encoder.isConfigSupported !== "function" || typeof Frame !== "function")
          throw unsupported("WebCodecs VP9 is unavailable; retain the existing Wasm route");
        const wire = view(heap, offset, 96); requireValue(wire.getUint32(0, true) === 1, "Unsupported VP9 configuration ABI");
        const width = wire.getUint32(4, true), height = wire.getUint32(8, true), numerator = wire.getUint32(20, true), denominator = wire.getUint32(24, true);
        requireValue(width >= 2 && height >= 2 && !(width & 1) && !(height & 1) && width <= 1920 && height <= 1080 && width * height <= WEBCODECS_VP9_LIMITS.maximumPixels,
          "Private VP9 dimensions exceed the bounded candidate");
        requireValue(numerator > 0 && denominator > 0 && numerator / denominator <= 120, "Invalid VP9 frame rate");
        requireValue(wire.getUint32(12, true) > 0 && wire.getUint32(16, true) > 0, "Invalid native time base");
        requireValue(BigInt(wire.getUint32(12, true)) * BigInt(numerator) === BigInt(wire.getUint32(16, true)) * BigInt(denominator),
          "This candidate requires the existing native constant-frame-rate time base");
        const bitrate = wire.getUint32(28, true); requireValue(bitrate >= 10000 && bitrate <= 20000000, "Invalid bounded VP9 bitrate");
        colors = colorSpace(wire);
        let candidate = { codec: "vp09.00.50.08", width, height, bitrate, framerate: numerator / denominator,
          hardwareAcceleration: "prefer-hardware", latencyMode: "realtime", bitrateMode: "variable" };
        let support = await Encoder.isConfigSupported(candidate); supportProbeCount++; active();
        hardwarePreferredSupported = support.supported;
        if (!support.supported) {
          // Codec/dimensions/bitrate/timing are unchanged. This is an explicit
          // platform-encoder preference fallback, NOT proof of physical GPU use.
          candidate = { ...candidate, hardwareAcceleration: "no-preference" };
          support = await Encoder.isConfigSupported(candidate); supportProbeCount++; active();
        }
        if (!support.supported) throw unsupported("Exact VP9 encoder configuration is unsupported; retain the existing Wasm route");
        for (const field of Object.keys(candidate)) requireValue(support.config[field] === candidate[field], "Encoder support check changed requested " + field);
        selectedHardwarePreference = candidate.hardwareAcceleration;
        config = { ...candidate, timeBaseNum: wire.getUint32(12, true), timeBaseDen: wire.getUint32(16, true) };
        encoder = new Encoder({ error: error => stop(error), output: (chunk, metadata) => {
          try {
            active(); requireValue(busy && expectedTimestamp !== null && pending === null, "VP9 output exceeds the one-packet handoff");
            requireValue(chunk.byteLength > 0 && chunk.byteLength <= WEBCODECS_VP9_LIMITS.maximumPacketBytes, "VP9 packet exceeds the fixed native packet bound");
            requireValue(chunk.timestamp === expectedTimestamp && (!keyRequired || chunk.type === "key"), "VP9 encoder changed frame order/timestamp or omitted a required keyframe");
            if (metadata?.decoderConfig?.description?.byteLength) throw unsupported("VP9 description bytes need a separately qualified native codec-parameter handoff");
            pending = chunk; peakPacketBytes = Math.max(peakPacketBytes, chunk.byteLength);
          } catch (error) { stop(error); }
        } });
        encoder.configure(candidate); active(); return 0;
      } catch (error) { stop(error); throw error; }
      finally { busy = false; }
    },
    async encode(heap, offset) {
      active(); requireValue(encoder && config && !busy && pending === null, "VP9 input requires an idle encoder and a consumed packet"); busy = true;
      let frame;
      try {
        const wire = view(heap, offset, 80), width = wire.getUint32(4, true), height = wire.getUint32(8, true);
        requireValue(wire.getUint32(0, true) === 1 && wire.getUint32(12, true) === 0 && width === config.width && height === config.height,
          "VP9 accepts only the configured bounded planar I420 frame");
        const bytes = width * height * 3 / 2, layouts = [], ranges = []; let target = 0;
        for (let plane = 0; plane < 3; plane++) {
          const at = 16 + plane * 16, start = wire.getUint32(at, true), stride = wire.getInt32(at + 4, true);
          const allocation = wire.getUint32(at + 8, true), allocationBytes = wire.getUint32(at + 12, true);
          const rowBytes = plane ? width / 2 : width, rows = plane ? height / 2 : height, last = start + (rows - 1) * stride;
          const low = Math.min(start, last), high = Math.max(start, last) + rowBytes;
          requireValue(allocationBytes > 0 && allocation + allocationBytes <= heap.length && Math.abs(stride) >= rowBytes &&
            low >= allocation && high <= allocation + allocationBytes && ranges.every(([a, b]) => high <= a || low >= b), "Invalid or overlapping native frame planes");
          layouts.push({ start, stride, rowBytes, rows, target }); ranges.push([low, high]); target += rowBytes * rows;
        }
        requireValue(target === bytes, "Invalid packed I420 size");
        if (!packed) packed = new Uint8Array(bytes); requireValue(packed.length === bytes, "Native frame dimensions changed");
        peakPackedBytes = Math.max(peakPackedBytes, bytes);
        for (const layout of layouts) for (let row = 0; row < layout.rows; row++)
          packed.set(heap.subarray(layout.start + row * layout.stride, layout.start + row * layout.stride + layout.rowBytes), layout.target + row * layout.rowBytes);
        const pts = wire.getBigInt64(64, true), num = BigInt(config.timeBaseNum) * 1000000n, den = BigInt(config.timeBaseDen);
        requireValue(pts >= 0n, "Negative native encoder timestamps need separate qualification");
        const timestamp = (pts * num + den / 2n) / den, next = ((pts + 1n) * num + den / 2n) / den;
        requireValue(timestamp <= BigInt(Number.MAX_SAFE_INTEGER) && next > timestamp, "Native timestamp cannot be represented exactly in WebCodecs");
        expectedTimestamp = Number(timestamp); keyRequired = wire.getUint32(72, true) === 1;
        requireValue(wire.getUint32(72, true) <= 1 && wire.getUint32(76, true) === 1, "Invalid native frame flags/duration");
        frame = new Frame(packed, { format: "I420", codedWidth: width, codedHeight: height, timestamp: expectedTimestamp,
          duration: Number(next - timestamp), colorSpace: colors });
        encoder.encode(frame, { keyFrame: keyRequired }); frame.close(); frame = null; framesClosed++;
        requireValue(encoder.encodeQueueSize <= 1, "VP9 encode queue exceeds one input");
        await encoder.flush(); active(); requireValue(pending !== null, "VP9 encoder produced no packet for this frame");
        frames++; return pending.byteLength;
      } catch (error) { stop(error); throw error; }
      finally { if (frame) { frame.close(); framesClosed++; } expectedTimestamp = null; busy = false; }
    },
    copy(heap, offset, bytes) {
      active();
      try {
        requireValue(!busy && pending && bytes === pending.byteLength, "Native packet copy must consume exactly one encoded chunk");
        view(heap, offset, bytes); const chunk = pending;
        chunk.copyTo(heap.subarray(offset, offset + bytes)); pending = null; packets++; return chunk.type === "key" ? 1 : 0;
      }
      catch (error) { stop(error); throw error; }
    },
    cancel,
    close() { signal?.removeEventListener("abort", cancel); stop(fault ?? new Error("VP9 bridge closed")); },
    snapshot() { return { frames, packets, framesClosed, busy, closed, currentPackedBytes: packed?.byteLength ?? 0,
      pendingPacketBytes: pending?.byteLength ?? 0, peakPackedBytes, peakPacketBytes, maximumPacketsInFlight: 1,
      maximumFramesInFlight: 1, supportProbeCount, hardwarePreferredSupported, selectedHardwarePreference,
      physicalHardwareSelectionProven: false, acceptanceMetric: false }; },
  };
}
