// Scalar diagnostics only. Requested backing sizes exclude allocator overhead;
// neither these values nor an incomplete conversion certify a memory budget.
export function refstructSampleBytes(sample) {
  const unavailable = {
    available: false, requestedLiveBytes: null, requestedCachedBytes: null,
    requestedTotalBackingBytes: null, allocatorOverheadBytes: null,
  };
  if (sample?.kind !== "refstruct-pool" || sample.statisticsComplete !== true)
    return unavailable;
  const { entryPayloadBytes: payload, entryRequestedAllocationBytes: backing,
    checkedOutEntries: live, cachedEntries: cached } = sample;
  if (![payload, backing, live, cached].every((n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff)
    || backing <= payload) return unavailable;
  const requestedLiveBytes = live * backing, requestedCachedBytes = cached * backing;
  const requestedTotalBackingBytes = requestedLiveBytes + requestedCachedBytes;
  if (![requestedLiveBytes, requestedCachedBytes, requestedTotalBackingBytes].every(Number.isSafeInteger))
    return unavailable;
  return { available: true, requestedLiveBytes, requestedCachedBytes,
    requestedTotalBackingBytes, allocatorOverheadBytes: null };
}
