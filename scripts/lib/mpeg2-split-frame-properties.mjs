// Private bounded native property transport. No JS decoding/logging of metadata,
// timestamps or side-data, and no intermediate byte copy or frame history.
const CAPACITY = 65536;
function heap(core, bytes) {
  const value = core?.HEAPU8;
  if (!(value instanceof Uint8Array) || value.byteOffset !== 0 ||
      value.byteLength !== bytes || value.buffer.byteLength !== bytes)
    throw new Error("Split property transport requires complete fixed heaps");
  return value;
}
function slot(view, offset, bytes) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > view.length - CAPACITY ||
      !Number.isSafeInteger(bytes) || bytes < 160 || bytes > CAPACITY)
    throw new Error("Invalid bounded native property slot");
}
export function copyMpeg2SplitProperties(decoder, encoder, sourceOffset, targetOffset, bytes) {
  const source = heap(decoder, 33554432), target = heap(encoder, 16777216);
  if (source.buffer === target.buffer) throw new Error("Split property heaps must be independent");
  slot(source, sourceOffset, bytes); slot(target, targetOffset, bytes);
  // Native import validates the complete wire record and commits transactionally.
  // Caller must import before submitting the copied pixel frame to the encoder.
  target.set(source.subarray(sourceOffset, sourceOffset + bytes), targetOffset);
  return bytes;
}
