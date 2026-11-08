// Qualification-only. This module is loaded only by the private worker overlay.
export const MKV_REUSE_WRITE_BYTES = 1024 * 1024;

export function createMkvWriteReuse(
  write: (operation: { type: "write"; position: number; data: Uint8Array<ArrayBuffer> }) => Promise<void>,
) {
  let buffer: Uint8Array<ArrayBuffer> | undefined;
  let inFlight = false;
  return async (position: number, source: Uint8Array): Promise<void> => {
    if (!Number.isSafeInteger(position) || position < 0 || !Number.isSafeInteger(position + source.byteLength) ||
        source.byteLength < 1 || source.byteLength > MKV_REUSE_WRITE_BYTES) {
      throw new RangeError("Private MKV write is outside its finite offset/1 MiB bound.");
    }
    if (inFlight) throw new Error("Private MKV output cannot have overlapping writes.");
    inFlight = true;
    try {
      buffer ??= new Uint8Array(MKV_REUSE_WRITE_BYTES);
      // Wasm memory (including shared Wasm) is never passed to the file API.
      // Do not mutate the only owned buffer until the destination acknowledges.
      buffer.set(source);
      await write({ type: "write", position, data: buffer.subarray(0, source.byteLength) });
    } finally {
      inFlight = false;
    }
  };
}
