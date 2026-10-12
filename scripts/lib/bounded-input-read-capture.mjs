// Browser-compatible, failure-only diagnostics. Never retain input or arbitrary error text.
export function createBoundedInputReadCapture({ read, inputSize, emit }) {
  if (typeof read !== "function" || typeof emit !== "function" || !Number.isSafeInteger(inputSize) || inputSize < 0)
    throw new TypeError("Invalid bounded input diagnostic configuration");
  let failedReads = 0, emittedRecords = 0;
  const property = (value, key) => { try { return value?.[key]; } catch { return undefined; } };
  const name = value => {
    const candidate = property(value, "name");
    return ["Error", "TypeError", "RangeError", "DOMException", "NotReadableError", "NotFoundError", "AbortError",
      "NetworkError", "SecurityError", "InvalidStateError", "DataError", "QuotaExceededError", "OperationError"].includes(candidate) ? candidate : null;
  };
  const code = value => { const candidate = property(value, "code"); return Number.isInteger(candidate) && candidate >= 0 && candidate <= 65535 ? candidate : null; };
  const integer = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  return {
    async read(offset, destination) {
      // Scalar snapshot only: neither destination nor thrown error is retained after this call.
      const requestedBytes = integer(property(destination, "byteLength"));
      try { return await read(offset, destination); }
      catch (error) {
        failedReads++;
        if (emittedRecords < 2) {
          emittedRecords++;
          try {
            const message = property(error, "message"), stack = property(error, "stack"), cause = property(error, "cause");
            const stackLocations = [];
            if (typeof stack === "string") {
              // Allow only known deployed source classes and numbers. No function, URL,
              // hash, arbitrary filename, message, or raw stack text leaves this function.
              for (const match of stack.slice(0, 4096).matchAll(/\/(engines\/remux\/(?:_private_split_decoder|within-(?:direct|remux|mpeg4))\.mjs|assets\/conversion\.worker-[A-Za-z0-9_-]+\.js):(\d{1,9}):(\d{1,9})/g)) {
                stackLocations.push({ source: match[1].startsWith("assets/") ? "production-worker" : "decoder-module",
                  line: Number(match[2]), column: Number(match[3]) });
                if (stackLocations.length === 8) break;
              }
            }
            emit({ version: 1, scope: "production-input-read-failure-not-cause-attribution", failureOrdinal: failedReads,
              offset: integer(offset), requestedBytes, inputSize, exceptionName: name(error), exceptionCode: code(error),
              messageClass: message === "network error" ? "network-error" : message === "Bounded input read control" ? "injected-control" : null,
              causeName: name(cause), causeCode: code(cause), stackAvailable: typeof stack === "string", stackLocations });
          } catch { /* A diagnostic getter/serializer/sink must not replace the original I/O failure. */ }
        }
        throw error;
      }
    },
    metrics: () => ({ failedReads, emittedRecords, maximumRecords: 2, maximumStackLocations: 8, retainsInput: false, retries: 0 }),
  };
}
