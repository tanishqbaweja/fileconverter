// Browser-compatible, diagnostic-only Emscripten onAbort observer.
// No polling, native calls, allocation records, queues, GC or error suppression.
export function createBoundedWasmAbortCapture({ role, emit }) {
  if (!['decoder', 'encoder'].includes(role) || typeof emit !== "function")
    throw new TypeError("Explicit decoder/encoder role and emitter required");
  let first = null, captureStarted = false, emitFailure = null;
  function onAbort(reason) {
    if (captureStarted) return;
    captureStarted = true;
    let text = null, reasonTruncated = false, stack = null, stackTruncated = false;
    let unavailable = null, stackLimitRestored = null;
    const previousLimit = Error.stackTraceLimit;
    try {
      if (typeof reason === "string") { text = reason.slice(0, 512); reasonTruncated = reason.length > 512; }
      else unavailable = "Abort reason is unavailable or not text";
      // One synchronous failure-only stack. Restore the prior setting even if
      // collection fails. Never change normal-conversion stack/debug settings.
      Error.stackTraceLimit = 64;
      const actual = new Error("Actual Emscripten abort observation").stack;
      if (typeof actual === "string") { stack = actual.slice(0, 8192); stackTruncated = actual.length > 8192; }
      else unavailable = "Actual abort stack is unavailable";
    } catch (error) { unavailable = String(error).slice(0, 512); }
    finally {
      try { Error.stackTraceLimit = previousLimit; stackLimitRestored = Error.stackTraceLimit === previousLimit; }
      catch { stackLimitRestored = Error.stackTraceLimit === previousLimit; }
    }
    first = Object.freeze({ scope: "one-actual-wasm-abort-stack-not-allocation-size-or-conversion-acceptance",
      role, observedAt: new Date().toISOString(), reason: text, reasonTruncated,
      stack, stackTruncated, unavailable, stackLimitRestored,
      maximumReasonCharacters: 512, maximumStackCharacters: 8192, maximumStackFrames: 64,
      failedIndividualAllocationBytes: null, heapLiveBytes: null, publicAcceptance: false });
    try { emit(first); } catch (error) { emitFailure = String(error).slice(0, 512); }
  }
  return Object.freeze({ onAbort,
    withPriorOnAbort: previous => reason => { onAbort(reason); return previous?.(reason); },
    report: () => ({ maximumRecords: 1, queuedRecords: 0, captureStarted, first, emitFailure,
      noNormalConversionSampling: true, noNativeFunctionCalled: true, noForcedGc: true,
      nativeErrorSuppressed: false }) });
}
