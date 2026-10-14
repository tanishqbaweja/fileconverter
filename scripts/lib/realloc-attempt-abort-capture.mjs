// Browser-only, one CURRENT native realloc request. No payload/native-at-fatal.
export const REALLOC_DECODER_SHA256 = "eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c";
export const REALLOC_SLOT = 1918912, REALLOC_ALLOCATOR_ROOT = 1786760;
export function readPendingReallocAttempt(core) {
  if (!(core?.HEAPU8 instanceof Uint8Array) || core.HEAPU8.byteLength !== 33554432 ||
      core.withinReallocAttemptAddress !== REALLOC_SLOT || core.withinReallocAttemptWords !== 16)
    throw new Error("Exact fixed heap and runtime native realloc-slot binding required");
  const view = new DataView(core.HEAPU8.buffer, core.HEAPU8.byteOffset, core.HEAPU8.byteLength);
  const words = Array.from({ length: 16 }, (_, i) => view.getUint32(REALLOC_SLOT + i * 4, true));
  if (words[0] !== 0x52414c31 || words[1] !== 1 || words[2] === 0 || words[3] !== 2 ||
      ![0,1].includes(words[4]) || words[6] !== 0 || words[10] !== 0 || words[14] !== 0 || words[15] !== 0 || words[13] === 0)
    throw new Error("Current pending Wasm32 realloc snapshot schema/phase unavailable");
  if (words[12] >= 33554432 || words[7] >= 33554432 || words[8] >= 33554432 || words[9] > 33554432)
    throw new Error("Recorded scalar pointers/old size outside fixed heap");
  if (words[4] === 0 && (words[5] !== words[13] || words.slice(7,12).some(x => x !== 0)))
    throw new Error("Direct realloc request cannot claim outer AVBuffer metadata");
  if (words[4] === 1 && (words[7] === 0 ? words.slice(8,12).some(x => x !== 0) : words[11] === 0))
    throw new Error("Outer buffer-reference scalar consistency unavailable");
  return Object.freeze({ sequence: words[2], phase: "av-realloc-pending", outerBufferScope: words[4] === 1,
    outerRequestedBytes: words[5], oldBufferRefAddress: words[7], oldBufferDataAddress: words[8], oldBufferSize: words[9], oldBufferRefcount: words[11],
    reallocPointerAddress: words[12], allocationApiRequestedBytes: words[13], failedIndividualAllocationBytes: null,
    allocatorInternalChunkBytes: null, completed: false, words: Object.freeze(words), wordsRead: 16, slotBytes: 64,
    caveat: "Exact av_realloc API argument, not inferred internal malloc chunk or heap extent; no original cause attribution" });
}
