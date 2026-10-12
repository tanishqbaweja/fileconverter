// Input-only diagnostic, NOT conversion, fidelity, scaling or memory acceptance.
// Stringifiable browser helper: one fixed buffer, serial production bridge reads.
export async function scanProductionInput({ read, inputSize, now = () => performance.now() }) {
  if (typeof read !== "function" || !Number.isSafeInteger(inputSize) || inputSize <= 0)
    throw new TypeError("Invalid production input scan");
  const buffer = new Uint8Array(65536), started = now();
  let sequentialReads = 0, sequentialBytes = 0, seekReads = 0, seekBytes = 0;
  const boundedRead = async (offset, requested) => {
    const count = await read(offset, buffer.subarray(0, requested));
    if (!Number.isSafeInteger(count) || count <= 0 || count > requested)
      throw new Error("Production input scan returned a premature EOF or invalid count");
    return count;
  };
  while (sequentialBytes < inputSize) {
    const count = await boundedRead(sequentialBytes, Math.min(buffer.byteLength, inputSize - sequentialBytes));
    sequentialBytes += count; sequentialReads++;
  }
  const seekOffsets = [...new Set([Math.min(2186655938, Math.max(0, inputSize - buffer.byteLength)),
    Math.max(0, inputSize - buffer.byteLength), 0])];
  for (const start of seekOffsets) {
    const end = Math.min(inputSize, start + buffer.byteLength);
    let offset = start;
    while (offset < end) { const count = await boundedRead(offset, end - offset); offset += count; seekReads++; seekBytes += count; }
  }
  return { version: 1, scope: "whole-original-production-input-read-and-seek-only-not-conversion",
    inputSize, sequentialBytes, sequentialReads, seekOffsets, seekReads, seekBytes, bufferBytes: buffer.byteLength,
    maximumPendingReads: 1, elapsedMs: Math.max(0, now() - started), convertedBytes: 0, encodedFrames: 0,
    fullConversionAcceptance: false, fidelityAcceptance: false, memoryAcceptance: false, originalFailureCauseProven: false };
}
