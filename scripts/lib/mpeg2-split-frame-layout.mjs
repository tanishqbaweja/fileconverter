// Browser-neutral reader of the private 64-byte wasm32 layout descriptor.
// Numeric offsets are used only inside the live handoff, never in telemetry.
export function readMpeg2SplitNativeLayout(heap, pointer) {
  if (!(heap instanceof Uint8Array) || heap.byteOffset !== 0
      || ![33554432, 16777216].includes(heap.byteLength) || heap.buffer.byteLength !== heap.byteLength
      || !Number.isSafeInteger(pointer) || pointer < 0 || pointer % 4 || pointer + 64 > heap.byteLength)
    throw new Error("Invalid fixed-heap native split descriptor slot");
  const record = new DataView(heap.buffer, pointer, 64);
  if (record.getUint32(0, true) !== 1) throw new Error("Unsupported split layout ABI");
  const pixelKind = record.getUint32(12, true);
  if (pixelKind > 1) throw new Error("Unsupported split pixel kind");
  const planes = [0, 1, 2].map((index) => {
    const at = 16 + 16 * index;
    return Object.freeze({ offset: record.getUint32(at, true), stride: record.getInt32(at + 4, true),
      allocationOffset: record.getUint32(at + 8, true), allocationBytes: record.getUint32(at + 12, true) });
  });
  return Object.freeze({ width: record.getUint32(4, true), height: record.getUint32(8, true),
    pixelFormat: pixelKind === 0 ? "yuv420p" : "yuv422p", planes: Object.freeze(planes) });
}
