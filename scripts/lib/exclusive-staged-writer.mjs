// Browser-compatible final-copy sink. One stream writer, one awaited operation.
// Not an engine/codec change; no media data, errors or promises retained in history.
export function createExclusiveStagedWriter(stream) {
  if (!stream || typeof stream.getWriter !== "function" || typeof stream.truncate !== "function")
    throw new TypeError("A real file-system writable stream is required");
  let ownedStream = stream, writer = null, phase = "open", pending = false;
  let locks = 0, releases = 0, writes = 0, maximumWriteBytes = 0;
  const guard = () => {
    if (phase !== "open") throw new TypeError("Final-copy writer is not open");
    if (pending) throw new TypeError("Final-copy backpressure requires awaiting the previous operation");
  };
  const acquire = () => {
    if (!writer) {
      writer = ownedStream.getWriter(); locks++;
      // Errors still propagate through awaited write/close/abort. Observe the
      // separate closed promise too so failure cleanup creates no unhandled rejection.
      writer.closed.catch(() => {});
    }
    return writer;
  };
  const release = () => {
    if (writer) { const current = writer; writer = null; current.releaseLock(); releases++; }
  };
  const operation = async callback => {
    guard(); pending = true;
    try { return await callback(); }
    catch (error) { phase = "failed"; throw error; }
    finally { pending = false; }
  };
  return Object.freeze({
    async truncate(size) {
      if (!Number.isSafeInteger(size) || size < 0) throw new RangeError("Invalid final-copy truncate size");
      return operation(() => writer ? writer.write({ type: "truncate", size }) : ownedStream.truncate(size));
    },
    async write(chunk) {
      if (!(chunk instanceof Uint8Array) || !(chunk.buffer instanceof ArrayBuffer) || chunk.byteLength > 524288)
        throw new RangeError("Final-copy writes require a non-shared view of at most512KiB");
      return operation(async () => {
        await acquire().write(chunk); writes++; maximumWriteBytes = Math.max(maximumWriteBytes, chunk.byteLength);
      });
    },
    async close() {
      guard(); phase = "closing"; pending = true;
      try {
        if (writer) await writer.close(); else await ownedStream.close();
        phase = "closed"; ownedStream = null;
      } catch (error) { phase = "failed"; throw error; }
      finally { pending = false; release(); }
    },
    async abort(reason) {
      if (phase === "closed" || phase === "aborted") return;
      if (pending) throw new TypeError("Cannot abort while a final-copy operation is pending");
      phase = "aborting"; pending = true;
      try { if (writer) await writer.abort(reason); else await ownedStream.abort(reason); }
      finally { pending = false; release(); ownedStream = null; phase = "aborted"; }
    },
    writerMetrics: () => ({ phase, locks, releases, writes, maximumWriteBytes,
      pendingOperations: pending ? 1 : 0, retainedWriter: writer !== null, retainedStream: ownedStream !== null,
      additionalCopyBufferBytes: 0, queuedChunks: 0 }),
  });
}
