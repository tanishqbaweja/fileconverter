// Exact updated ABI. Same validated64B schema; no fake Module slot bindings.
export const REALLOC_ALIGNED_SLOT = 1918848;
export function readReallocAlignedAttemptSnapshot(core) {
  if (!(core?.HEAPU8 instanceof Uint8Array) || core.HEAPU8.byteLength !== 33554432 ||
    core.withinAllocatorAttemptAddress !== REALLOC_ALIGNED_SLOT || core.withinAllocatorAttemptWords !== 16)
    throw new Error("Qualified fixed heap/constructor slot binding unavailable");
  const view = new DataView(core.HEAPU8.buffer, core.HEAPU8.byteOffset, core.HEAPU8.byteLength);
  const words = Array.from({ length: 16 }, (_, index) => view.getUint32(REALLOC_ALIGNED_SLOT + index * 4, true));
  if (words[0] !== 1095519281 || words[1] !== 1 || words[2] === 0 || ![1, 4].includes(words[3]) ||
    words[4] !== 16 || words[5] === 0 || words[6] !== 0 || words[8] !== 0 || words[9] !== (words[7] & 15) ||
    ![0, 1].includes(words[10]) || words.slice(11).some(value => value !== 0))
    throw new Error("Current pending allocation snapshot schema/state unavailable");
  if (words[3] === 1 && (words[5] < 262144 || words.slice(7, 11).some(value => value !== 0)))
    throw new Error("Fast allocation phase inconsistent");
  if (words[3] === 4 && (words[7] >= core.HEAPU8.byteLength ||
    (words[7] !== 0 && (words[9] !== 8 || words[10] !== 1)) || (words[7] === 0 && words[10] !== 0)))
    throw new Error("Aligned fallback ownership/state inconsistent");
  return Object.freeze({ scope: "native-wrapper-request-and-pending-phase-not-internal-chunk-size-or-live-heap",
    words: Object.freeze(words), wordsRead: 16, slotBytes: 64, sequence: words[2],
    phase: words[3] === 1 ? "fast-malloc-pending" : "upstream-alignment-pending",
    wrapperRequestedBytes: words[5], alignment: words[4], freshUnexposedPointerFreed: words[10] === 1,
    completed: false, allocatorInternalChunkBytes: null,
    failedIndividualAllocationBytes: words[3] === 1 ? words[5] : null });
}
