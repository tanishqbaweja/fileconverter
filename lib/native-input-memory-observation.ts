import type { ConversionMetrics } from "./conversion-protocol";

/** Only call with the HEAP subarray supplied by the native AVIO input callback.
 * Reading its backing buffer observes the real current Wasm allocation even
 * when header writing fails before C's first periodic progress callback. No
 * allocation, byte copy, guessed initial heap, or process-memory substitution.
 */
export function observeNativeInputMemory(
  metrics: ConversionMetrics,
  nativeInputView: Uint8Array,
  fixedSharedBytes: number,
): void {
  const bytes = nativeInputView.buffer.byteLength;
  if (!Number.isSafeInteger(bytes) || bytes <= 0 ||
      !Number.isSafeInteger(fixedSharedBytes) || fixedSharedBytes < 0) {
    throw new Error("Native input memory observation is unavailable.");
  }
  metrics.wasmMemoryBytes = Math.max(metrics.wasmMemoryBytes ?? 0, bytes);
  metrics.peakWasmMemoryBytes = Math.max(metrics.peakWasmMemoryBytes ?? 0, metrics.wasmMemoryBytes);
  const sharedBytes = typeof SharedArrayBuffer !== "undefined" && nativeInputView.buffer instanceof SharedArrayBuffer ? bytes : 0;
  metrics.sharedArrayBufferBytes = Math.max(metrics.sharedArrayBufferBytes ?? 0, fixedSharedBytes + sharedBytes);
}
