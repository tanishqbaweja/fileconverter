// Synchronous codec handoff inside the production conversion worker. The native
// decoder/mux stack, not JS, owns all AVIO awaits and output backpressure.
import { copyMpeg2SplitPixels } from "./mpeg2-split-frame-bridge.mjs";
import { readMpeg2SplitNativeLayout } from "./mpeg2-split-frame-layout.mjs";
import { copyMpeg2SplitProperties } from "./mpeg2-split-frame-properties.mjs";
import { readMpeg2SplitPacket } from "./mpeg2-split-packet-bridge.mjs";
function slot(heap, pointer, bytes) {
  if (!(heap instanceof Uint8Array) || heap.byteOffset || heap.byteLength !== 33554432 || heap.buffer.byteLength !== 33554432 ||
    !Number.isSafeInteger(pointer) || pointer <= 0 || !Number.isSafeInteger(bytes) || bytes < 0 || pointer > heap.length - bytes)
    throw new Error("Invalid fixed decoder handoff backing");
}
export function createMpeg2SplitSession(options) {
  let { encoder, isCancelled } = options;
  if (encoder?.HEAPU8?.byteLength !== 16777216 || encoder.HEAPU8.byteOffset || encoder.HEAPU8.buffer.byteLength !== 16777216 ||
    typeof isCancelled !== "function") throw new Error("Fixed separate encoder required");
  let initialEncoderHeap = encoder.HEAPU8;
  let decoderBuffer = null, packet = null, held = false, opened = false, flushing = false, closed = false, failed = false;
  let frames = 0, copiedPixelBytes = 0, packets = 0, copiedPacketBytes = 0, completedPackets = 0;
  let peakFrameBytes = 0, peakPacketBytes = 0, peakSideBytes = 0, releaseUnknown = false;
  function guard(heap) {
    slot(heap, 1, 0);
    if (decoderBuffer && decoderBuffer !== heap.buffer) throw new Error("Decoder heap changed");
    if (!decoderBuffer) decoderBuffer = heap.buffer;
    if (encoder.HEAPU8 !== initialEncoderHeap) throw new Error("Encoder heap changed");
    if (isCancelled()) throw new Error("Split conversion cancelled");
  }
  function success(result, phase) { if (result < 0) throw new Error(`Separate encoder ${phase} failed (${result})`); return result; }
  const metrics = () => Object.freeze({ scope: "private-split-production-pipeline-not-public-acceptance",
    decoderMemoryBytes: 33554432, encoderMemoryBytes: 16777216, aggregateWasmMemoryBytes: 50331648,
    frames, copiedPixelBytes, packets, completedPackets, copiedPacketBytes, peakFrameBytes, peakPacketBytes, peakSideBytes,
    activePackets: releaseUnknown ? null : held ? 1 : 0, queuedPackets: 0, queuedFrames: 0,
    additionalPixelBufferBytes: 0, additionalJsPacketBufferBytes: 0, failed, closed });
  function release(completed) {
    if (!held) throw new Error("No encoded packet to release");
    try {
      success(encoder._within_split_encoder_release_packet(), "release");
      packet = null; held = false; if (completed === 1) completedPackets++; return 0;
    } catch (error) { releaseUnknown = true; throw error; }
  }
  function close() {
    if (!closed) {
      // Native codec closure owns failure cleanup, including a held packet.
      const result = encoder._within_split_encoder_close();
      if (result !== 0) { failed = true; throw new Error("Separate native encoder close failed"); }
      packet = null; held = false; releaseUnknown = false; opened = false; closed = true;
      encoder = isCancelled = decoderBuffer = initialEncoderHeap = null;
    }
    return 0;
  }
  return Object.freeze({ metrics, close,
    call(operation, heap, a = 0, b = 0, c = 0) {
      try {
        if (operation === 6) return close();
        if (operation === 4) return release(a); // Never block owned cleanup on cancellation.
        if (closed || failed) throw new Error("Split session closed or failed");
        guard(heap);
        if (operation === 0) {
          if (opened) throw new Error("Encoder already open");
          slot(heap, a, 96); slot(heap, b, 65536);
          const config = encoder._within_split_encoder_config();
          if (config <= 0 || config > 16777216 - 96) throw new Error("Invalid native encoder config slot");
          encoder.HEAPU8.set(heap.subarray(a, a + 96), config);
          success(encoder._within_split_encoder_open(), "open");
          if (encoder._within_split_encoder_settings_match() !== 1) throw new Error("Native encoder settings changed");
          const bytes = encoder._within_split_encoder_parameter_bytes(), pointer = encoder._within_split_encoder_parameters();
          if (bytes < 144 || bytes > 65536 || pointer <= 0 || pointer > 16777216 - bytes) throw new Error("Invalid encoder parameter slot");
          heap.set(encoder.HEAPU8.subarray(pointer, pointer + bytes), b); opened = true; return bytes;
        }
        if (!opened) throw new Error("Separate encoder not initialized");
        if (operation === 1) {
          if (held || flushing) throw new Error("Previous frame/packet not drained");
          const layout = success(encoder._within_split_encoder_prepare(), "prepare");
          try {
            const from = readMpeg2SplitNativeLayout(heap, a), to = readMpeg2SplitNativeLayout(encoder.HEAPU8, layout);
            const bytes = copyMpeg2SplitPixels({ HEAPU8: heap }, encoder, from, to);
            copyMpeg2SplitProperties({ HEAPU8: heap }, encoder, b, encoder._within_split_encoder_properties(), c);
            success(encoder._within_split_encoder_send(c), "send");
            frames++; copiedPixelBytes += bytes; peakFrameBytes = Math.max(peakFrameBytes, bytes); return 0;
          } catch (error) {
            if (encoder._within_split_encoder_state() === 2) encoder._within_split_encoder_abort_frame();
            throw error;
          }
        }
        if (operation === 5) {
          if (held || flushing) throw new Error("Cannot flush with a held packet or twice");
          success(encoder._within_split_encoder_flush(), "flush"); flushing = true; return 0;
        }
        if (operation === 2) {
          if (held) throw new Error("Mux must consume and release the previous packet");
          slot(heap, a, 320);
          const status = success(encoder._within_split_encoder_next_packet(), "receive");
          if (status === 0 || status === 2) {
            if ((status === 2) !== flushing) throw new Error("Encoder ended in the wrong phase"); return status;
          }
          if (status !== 1) throw new Error("Unknown native packet status");
          // Encoder has acquired a packet even if descriptor validation fails;
          // enclosing close always releases it on every native/JS failure.
          held = true; packet = readMpeg2SplitPacket(encoder, encoder._within_split_encoder_packet_record());
          const w = new DataView(heap.buffer, a, 320); heap.fill(0, a, a + 320);
          w.setUint32(0, 1, true); w.setUint32(8, packet.bytes, true); w.setUint32(12, packet.flags, true);
          w.setBigInt64(16, packet.pts, true); w.setBigInt64(24, packet.dts, true);
          w.setBigInt64(32, packet.duration, true); w.setBigInt64(40, packet.position, true);
          w.setInt32(48, packet.timeBaseNumerator, true); w.setInt32(52, packet.timeBaseDenominator, true);
          w.setUint32(56, packet.sides.length, true);
          packet.sides.forEach((side, i) => { w.setUint32(64 + i * 16, side.type, true); w.setUint32(72 + i * 16, side.bytes, true); });
          packets++; peakPacketBytes = Math.max(peakPacketBytes, packet.bytes); peakSideBytes = Math.max(peakSideBytes, packet.sideBytes);
          return 1;
        }
        if (operation === 3) {
          if (!packet) throw new Error("No encoder-owned packet to copy"); slot(heap, a, 320);
          const w = new DataView(heap.buffer, a, 320);
          if (w.getUint32(0, true) !== 1 || w.getUint32(8, true) !== packet.bytes || w.getUint32(12, true) !== packet.flags ||
            w.getBigInt64(16, true) !== packet.pts || w.getBigInt64(24, true) !== packet.dts ||
            w.getBigInt64(32, true) !== packet.duration || w.getBigInt64(40, true) !== packet.position ||
            w.getInt32(48, true) !== packet.timeBaseNumerator || w.getInt32(52, true) !== packet.timeBaseDenominator ||
            w.getUint32(56, true) !== packet.sides.length || w.getUint32(60, true)) throw new Error("Mux packet fields changed before copy");
          const target = w.getUint32(4, true); slot(heap, target, packet.bytes);
          const destinations = packet.sides.map((side, i) => {
            const at = 64 + i * 16;
            if (w.getUint32(at, true) !== side.type || w.getUint32(at + 8, true) !== side.bytes || w.getUint32(at + 12, true))
              throw new Error("Mux side fields changed before copy");
            const pointer = w.getUint32(at + 4, true); slot(heap, pointer, side.bytes); return pointer;
          });
          heap.set(encoder.HEAPU8.subarray(packet.offset, packet.offset + packet.bytes), target);
          packet.sides.forEach((side, i) => heap.set(encoder.HEAPU8.subarray(side.offset, side.offset + side.bytes), destinations[i]));
          copiedPacketBytes += packet.bytes; return 0;
        }
        throw new Error("Unknown split handoff operation");
      } catch (error) { failed = true; throw error; }
    },
  });
}
