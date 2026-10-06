// Private failure-only instrumentation, not allocation tracking or acceptance.
export function createSplitAbortProbe({ memoryBytes, onAbort, emit = console.debug, ErrorType = Error }) {
  let emitted = 0;
  return what => {
    try {
      if (emitted < 2) {
        emitted++;
        const previous = ErrorType.stackTraceLimit;
        let stack;
        try { ErrorType.stackTraceLimit = 32; stack = String(new ErrorType("Private split decoder abort stack").stack ?? "").slice(0, 8192); }
        finally { ErrorType.stackTraceLimit = previous; }
        emit("WITHIN_MPEG2_OOM_STACK " + JSON.stringify({ scope: "failure-only-not-memory-acceptance",
          what: String(what).slice(0, 512), stack, memoryBytes: memoryBytes(), sequence: emitted }));
      }
    } catch { /* Diagnostic failure must not replace the original abort. */ }
    finally { onAbort?.(what); }
  };
}
