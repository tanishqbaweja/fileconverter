// Private codec-to-mux ownership, not conversion acceptance. Native owner must
// retain the AVPacket until the awaited consumer finishes, and the mux owner
// must copy into its own native packet then rescale timestamps in native C.
const MEMORY = 16777216;
function fixedHeap(core) {
  const heap = core?.HEAPU8;
  if (!(heap instanceof Uint8Array) || heap.byteOffset || heap.byteLength !== MEMORY || heap.buffer.byteLength !== MEMORY)
    throw new Error("Encoded packet bridge requires a complete fixed 16 MiB heap");
  return heap;
}
function range(offset, bytes) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(bytes) || offset < 0 || bytes < 0 ||
      offset > MEMORY - bytes || (bytes && !offset)) throw new Error("Encoded packet outside native backing");
}
export function readMpeg2SplitPacket(core, pointer) {
  const heap = fixedHeap(core);
  if (!Number.isSafeInteger(pointer) || pointer <= 0 || pointer % 4 || pointer > MEMORY - 320)
    throw new Error("Invalid encoded packet descriptor");
  const wire = new DataView(heap.buffer, pointer, 320);
  if (wire.getUint32(0, true) !== 1 || wire.getUint32(60, true)) throw new Error("Unknown encoded packet ABI");
  const offset = wire.getUint32(4, true), bytes = wire.getUint32(8, true), flags = wire.getUint32(12, true);
  range(offset, bytes);
  if (bytes > 1048576 || (flags & ~23)) throw new Error("Encoded packet budget or flags unsupported");
  const timeBaseNumerator = wire.getInt32(48, true), timeBaseDenominator = wire.getInt32(52, true);
  const count = wire.getUint32(56, true);
  if (timeBaseNumerator <= 0 || timeBaseDenominator <= 0 || count > 16) throw new Error("Invalid encoded packet clock or side count");
  const sides = []; let sideBytes = 0;
  for (let i = 0; i < 16; i++) {
    const at = 64 + i * 16, type = wire.getUint32(at, true), start = wire.getUint32(at + 4, true);
    const length = wire.getUint32(at + 8, true), reserved = wire.getUint32(at + 12, true);
    if (i >= count) {
      if (type || start || length || reserved) throw new Error("Unclaimed encoded side descriptor");
      continue;
    }
    range(start, length);
    // FFmpeg 8.1.2: raw NEW_EXTRADATA=1, QUALITY_STATS=8, CPB_PROPERTIES=10.
    if (reserved || ![1, 8, 10].includes(type) || !length || (type === 8 && length < 8) ||
        (type === 10 && length !== 40) || length > 65536 - sideBytes)
      throw new Error("Unsupported or oversized encoded side data");
    sideBytes += length; sides.push(Object.freeze({ type, offset: start, bytes: length }));
  }
  return Object.freeze({ offset, bytes, flags,
    pts: wire.getBigInt64(16, true), dts: wire.getBigInt64(24, true),
    duration: wire.getBigInt64(32, true), position: wire.getBigInt64(40, true),
    timeBaseNumerator, timeBaseDenominator, sideBytes, sides: Object.freeze(sides) });
}

export function createMpeg2SplitPacketDrain(options) {
  let { encoder, consume, isCancelled } = options ?? {};
  if (typeof consume !== "function" || typeof isCancelled !== "function") throw new Error("Packet ownership callbacks required");
  fixedHeap(encoder);
  for (const name of ["_within_split_encoder_next_packet", "_within_split_encoder_packet_record", "_within_split_encoder_release_packet"])
    if (typeof encoder[name] !== "function") throw new Error("Native encoded packet owner required");
  let active = false, closed = false, failed = false, observedPackets = 0, completedPackets = 0, observedBytes = 0;
  let peakPacketBytes = 0, peakSideBytes = 0, held = false;
  const metrics = () => Object.freeze({ scope: "private-encoded-packet-ownership-not-conversion-acceptance",
    observedPackets, completedPackets, observedBytes, peakPacketBytes, peakSideBytes,
    activePackets: held === null ? null : held ? 1 : 0,
    queuedPackets: 0, additionalPacketBufferBytes: 0, closed, failed });
  function cancelled() { if (isCancelled()) throw new Error("Encoded packet handoff cancelled"); }
  return Object.freeze({ metrics,
    async drain({ flushing = false } = {}) {
      if (typeof flushing !== "boolean" || closed || failed || active) throw new Error("Encoded packet drain is closed, failed, active or malformed");
      active = true;
      try {
        const before = fixedHeap(encoder);
        for (;;) {
          cancelled();
          if (fixedHeap(encoder) !== before) throw new Error("Encoded packet heap changed");
          const status = encoder._within_split_encoder_next_packet();
          if (status === 0 || status === 2) {
            if ((status === 2) !== flushing) throw new Error("Native encoder ended in the wrong drain phase");
            return status === 2 ? "eof" : "needs-input";
          }
          if (status !== 1) throw new Error(`Native encoded packet receive failed (${status})`);
          held = true;
          let failure;
          try {
            const packet = readMpeg2SplitPacket(encoder, encoder._within_split_encoder_packet_record());
            if (!Number.isSafeInteger(observedBytes + packet.bytes) || !Number.isSafeInteger(observedPackets + 1))
              throw new Error("Encoded packet counters exhausted");
            observedPackets++; observedBytes += packet.bytes;
            peakPacketBytes = Math.max(peakPacketBytes, packet.bytes); peakSideBytes = Math.max(peakSideBytes, packet.sideBytes);
            cancelled(); await consume(packet); cancelled();
            if (fixedHeap(encoder) !== before) throw new Error("Encoded packet heap changed across consumer await");
            completedPackets++;
          } catch (error) { failure = error; }
          finally {
            try {
              if (encoder._within_split_encoder_release_packet() !== 0) throw new Error("Native encoded packet release failed");
              held = false;
            } catch (error) {
              // A failed release is not proof of zero native ownership. The
              // enclosing codec owner must close its native module in finally.
              held = null;
              failure = failure ? new AggregateError([failure, error], "Encoded packet consumption and release failed") : error;
            }
          }
          if (failure) throw failure;
        }
      } catch (error) { failed = true; throw error; }
      finally { active = false; }
    },
    close() {
      if (active || held === true) throw new Error("Cannot close an active encoded packet handoff");
      closed = true; encoder = consume = isCancelled = null;
      return metrics();
    },
  });
}
