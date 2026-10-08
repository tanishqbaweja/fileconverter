// Browser-compatible, one failure-only observer. No native call or payload read.
import { createBoundedWasmAbortCapture } from "./bounded-wasm-abort-capture.mjs";
import { readLateRefstructAbortSnapshot } from "./late-refstruct-abort-snapshot.mjs";
export function createLatePoolAbortCapture({ getCore, emit, poolGetterFunctionIndex, avMallocFunctionIndex }) {
  if (typeof getCore !== "function" || typeof emit !== "function" ||
    ![poolGetterFunctionIndex, avMallocFunctionIndex].every(value => Number.isInteger(value) && value >= 0 && value <= 10000) ||
    poolGetterFunctionIndex === avMallocFunctionIndex) throw new TypeError("Actual binary indices and explicit core/emitter required");
  let first = null, emitFailure = null;
  const base = createBoundedWasmAbortCapture({ role: "decoder", emit: row => {
    let request = null, unavailable = null;
    try {
      if (row.stackTruncated || row.unavailable || !row.stack?.includes(`wasm-function[${poolGetterFunctionIndex}]`) ||
        !row.stack.includes(`wasm-function[${avMallocFunctionIndex}]`)) throw new Error("Actual pool-get/av_malloc abort call path unavailable");
      request = readLateRefstructAbortSnapshot(getCore());
    } catch (error) { unavailable = String(error).slice(0, 512); }
    first = Object.freeze({ ...row, scope: "one-actual-pending-pool-request-and-abort-stack-not-conversion-acceptance",
      latePoolRequest: request, latePoolRequestUnavailable: unavailable,
      maximumRequestScalarBytesRead: 64, allocatorFreeBlocks: null, heapLiveBytes: null,
      noNativeCallsAtAbort: true, noPayloadRead: true, noHeapCopy: true });
    try { emit(first); } catch (error) { emitFailure = String(error).slice(0, 512); }
  } });
  return Object.freeze({ onAbort: base.onAbort, withPriorOnAbort: base.withPriorOnAbort,
    report: () => ({ ...base.report(), first, emitFailure, maximumRequestScalarBytesRead: 64,
      noNormalConversionSampling: true, queuedRecords: 0, noNativeCallsAtAbort: true }) });
}
