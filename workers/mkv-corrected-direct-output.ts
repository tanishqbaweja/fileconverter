import { CORRECTED_DIRECT_MKV_WRITE_BYTES } from "../lib/mkv-corrected-direct-qualification";
import { asynchronousFileStreamDestination } from "./random-access-destination";
import type { DestinationWrite, RandomAccessDestination } from "./random-access-destination";

export async function openCorrectedDirectMkvOutput(handle: FileSystemFileHandle): Promise<RandomAccessDestination> {
  const writable = await handle.createWritable({ keepExistingData: false });
  try {
    await writable.truncate(0);
    return reuseCorrectedDirectMkvOutput(asynchronousFileStreamDestination(writable, undefined, CORRECTED_DIRECT_MKV_WRITE_BYTES));
  } catch (error) {
    // No outer destination exists yet. Abort here if initialization fails.
    await writable.abort(error).catch(() => {});
    throw error;
  }
}

// The private native bridge may give us a view into shared Wasm. The only
// file-API view is into this job-owned fixed slot, never native memory. Await
// every write before reuse, including when native seeks backwards to patch.
export function reuseCorrectedDirectMkvOutput(target: RandomAccessDestination): RandomAccessDestination {
  if (!target.requiresOwnedWriteBuffer || target.writeSync || target.maximumWriteBytes !== CORRECTED_DIRECT_MKV_WRITE_BYTES)
    throw new Error("Corrected direct MKV requires the asynchronous 1 MiB file writer.");
  let owned: Uint8Array<ArrayBuffer> | undefined;
  let pending = false, closed = false;
  return {
    requiresOwnedWriteBuffer: false,
    maximumWriteBytes: CORRECTED_DIRECT_MKV_WRITE_BYTES,
    async write(operation: DestinationWrite) {
      if (closed || pending) throw new Error("Corrected direct MKV output requires one write at a time.");
      const source = operation instanceof Uint8Array ? operation : operation.data;
      const position = operation instanceof Uint8Array ? undefined : operation.position;
      if (source.byteLength < 1 || source.byteLength > CORRECTED_DIRECT_MKV_WRITE_BYTES ||
          (position !== undefined && (!Number.isSafeInteger(position) || position < 0 || !Number.isSafeInteger(position + source.byteLength))))
        throw new RangeError("Corrected direct MKV write exceeds its bounded size or address.");
      pending = true;
      try {
        owned ??= new Uint8Array(CORRECTED_DIRECT_MKV_WRITE_BYTES);
        owned.set(source);
        await target.write({ type: "write", position, data: owned.subarray(0, source.byteLength) });
      } finally { pending = false; }
    },
    async truncate(size) {
      if (closed || pending || !Number.isSafeInteger(size) || size < 0) throw new Error("Invalid corrected direct MKV truncate.");
      pending = true;
      try { await target.truncate(size); }
      finally { pending = false; }
    },
    async close() {
      if (closed || pending) throw new Error("Corrected direct MKV output is not ready to close.");
      pending = true;
      try { await target.close(); closed = true; owned = undefined; }
      finally { pending = false; }
    },
    async abort(error) {
      if (closed) return;
      closed = true;
      // Native writes are awaited; normal cancellation reaches here only
      // after a write settles. Release references even if the sink rejects.
      try { await target.abort(error); }
      finally { owned = undefined; }
    },
  };
}
