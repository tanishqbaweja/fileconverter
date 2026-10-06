// One simultaneous, source-bound boundary. Never sum stale last-seen pools.
const integer = (value, low, high) => Number.isSafeInteger(value) && value >= low && value <= high;
const exactKeys = (row, keys) => row && typeof row === "object" && !Array.isArray(row)
  && Object.keys(row).sort().join("|") === keys.slice().sort().join("|");
export function hevcAuxiliaryPoolBytes(sample) {
  const unavailable = { available: false, requestedLiveBytes: null, requestedCachedBytes: null,
    allocatorOverheadBytes: null, contiguousFreeBlockCapacity: null, pools: null };
  if (!exactKeys(sample, ["kind", "sequence", "phase", "layer", "activeDpbFrames", "shortReferenceFrames",
    "longReferenceFrames", "outputPendingFrames", "pools", "scope"])
    || sample.kind !== "hevc-auxiliary-pools" || sample.phase !== "before-encoder-send"
    || sample.scope !== "simultaneous-read-only-pools-not-free-blocks-not-acceptance"
    || !integer(sample.sequence, 1, 48) || !integer(sample.layer, 0, 1)
    || !integer(sample.activeDpbFrames, 0, 32) || !Array.isArray(sample.pools) || sample.pools.length !== 2)
    return unavailable;
  // A frame can be both output-pending and a reference: do not add these counts.
  for (const field of ["shortReferenceFrames", "longReferenceFrames", "outputPendingFrames"])
    if (!integer(sample[field], 0, sample.activeDpbFrames)) return unavailable;
  const pools = [];
  let requestedLiveBytes = 0, requestedCachedBytes = 0;
  for (const [index, name] of ["tab_mvf", "rpl_tab"].entries()) {
    const row = sample.pools[index];
    if (!exactKeys(row, ["name", "configured", "statisticsComplete", "payloadBytes", "backingBytesPerEntry",
      "liveEntries", "cachedEntries"]) || row.name !== name || row.configured !== true || row.statisticsComplete !== true
      || !integer(row.payloadBytes, 1, 33554432) || !integer(row.backingBytesPerEntry, row.payloadBytes + 1, 33554432)
      || !integer(row.liveEntries, 0, 0xffffffff) || !integer(row.cachedEntries, 0, 128)) return unavailable;
    const live = row.liveEntries * row.backingBytesPerEntry, cached = row.cachedEntries * row.backingBytesPerEntry;
    if (!integer(live + cached, 0, 33554432)) return unavailable;
    requestedLiveBytes += live; requestedCachedBytes += cached;
    if (!integer(requestedLiveBytes + requestedCachedBytes, 0, 33554432)) return unavailable;
    pools.push({ name, requestedLiveBytes: live, requestedCachedBytes: cached });
  }
  return { available: true, requestedLiveBytes, requestedCachedBytes,
    allocatorOverheadBytes: null, contiguousFreeBlockCapacity: null, pools };
}
