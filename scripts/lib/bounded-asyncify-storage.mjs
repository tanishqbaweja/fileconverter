// One module-owned suspension allocation. Never shrink the compiled stack.
// Browser-safe and self-contained so the exact function can be embedded in glue.
export function createBoundedAsyncifyStorage({ malloc, free, heap }) {
  const stackBytes = 262144, headerBytes = 12, bytes = stackBytes + headerBytes;
  let pointer = 0, leased = false, closing = false, allocations = 0, frees = 0, acquisitions = 0;
  function memory() {
    const value = heap();
    if (!(value instanceof Uint8Array) || value.byteOffset !== 0 || value.byteLength !== 33554432)
      throw new Error("Asyncify storage requires the unchanged fixed32MiB heap");
    return value;
  }
  function zero() { memory().fill(0, pointer, pointer + bytes); }
  function reserve() {
    if (closing) throw new Error("Asyncify storage is closed");
    memory();
    if (!pointer) {
      const next = malloc(bytes);
      if (!Number.isSafeInteger(next) || next <= 0 || next % 4 !== 0 || next + bytes > memory().byteLength)
        throw new Error("Unable to reserve bounded Asyncify suspension storage");
      pointer = next; allocations++; zero();
    }
    return pointer;
  }
  function acquire() {
    if (leased) throw new Error("Nested Asyncify suspension storage lease");
    const result = reserve(); zero(); leased = true; acquisitions++; return result;
  }
  function destroy() {
    if (!pointer) return;
    zero(); free(pointer); pointer = 0; frees++;
  }
  function release(value) {
    if (!leased || value !== pointer) throw new Error("Foreign or duplicate Asyncify suspension release");
    zero(); leased = false;
    if (closing) destroy();
  }
  function close() {
    closing = true;
    // An unwind/rewind still owns these bytes. Do not free them under its feet.
    if (!leased) destroy();
  }
  function metrics() {
    return { stackBytes, headerBytes, reservationBytes: bytes, allocations, frees, acquisitions,
      activeLeases: Number(leased), retainedBytes: pointer ? bytes : 0, closing,
      maximumLeases: acquisitions ? 1 : 0, zeroOnAcquireAndRelease: true };
  }
  return { reserve, acquire, release, close, metrics };
}
