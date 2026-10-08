// Failure-only bounded scalar reads. Never calls native functions/reads payloads.
export function readLateRefstructAbortSnapshot(core) {
  const heap = core?.HEAPU8, address = core?.withinRefstructAbortSnapshotAddress;
  if (!(heap instanceof Uint8Array) || heap.byteLength !== 33554432)
    throw new Error("Exact fixed32MiB decoder heap unavailable");
  if (core.withinRefstructAbortSnapshotWords !== 16 || !Number.isSafeInteger(address) || address <= 0 ||
    address % 4 || address + 64 > heap.byteLength) throw new Error("Fixed request-slot address/ABI unavailable");
  const view = new DataView(heap.buffer, heap.byteOffset + address, 64);
  const words = Array.from({ length: 16 }, (_, i) => view.getUint32(i * 4, true));
  if (words[0] !== 0x52504631 || words[1] !== 1 || words[2] === 0 || words[3] !== 1 || words[12] !== 4)
    throw new Error("No actual in-progress wasm32 fresh pool request");
  if (view.getUint32(0, true) !== words[0] || view.getUint32(8, true) !== words[2] || view.getUint32(12, true) !== words[3])
    throw new Error("Request slot changed during failure observation");
  const [, , sequence, , poolAddress, payloadBytes, headerBytes, requestedBytes, liveEntries,
    cachedHead, uninited, poolFlags, , countsComplete] = words;
  if (poolAddress % 4 || poolAddress <= 0 || poolAddress + 64 > heap.byteLength || headerBytes < 16 ||
    headerBytes > 64 || headerBytes % 16 || requestedBytes === 0 ||
    payloadBytes > 0xffffffff - headerBytes || requestedBytes !== payloadBytes + headerBytes ||
    cachedHead !== 0 || uninited !== 0 || countsComplete !== 1 || words[14] || words[15])
    throw new Error("Actual request/entry-header/pool invariants unavailable");
  return { scope: "one-actual-in-progress-pool-request-at-abort-not-media-or-acceptance",
    sequence, observedPoolAddress: poolAddress, poolName: null, payloadBytes, refcountHeaderBytes: headerBytes,
    failedIndividualAllocationBytes: requestedBytes, liveEntriesBeforeRequest: liveEntries,
    cachedEntriesInRequestedPoolBeforeRequest: 0, poolFlags,
    maximumScalarBytesRead: 64, heapCopied: false, payloadRead: false, nativeFunctionsCalled: false,
    liveReferencesChanged: false, publicAcceptance: false };
}
