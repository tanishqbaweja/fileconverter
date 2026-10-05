import { refstructSampleBytes } from "./refstruct-sample-bytes.mjs";

// One single-thread encoder boundary, not a sum of stale last-seen pools.
// Absent configured=false pools are distinct from failed/unknown readings.
export function mpeg2EncoderReleaseBytes(sample) {
  const unavailable = { available: false, requestedLiveBytes: null,
    requestedCachedBytes: null, allocatorOverheadBytes: null, pools: null };
  if (sample?.kind !== "mpeg2-encoder-pool-release" || sample.codecId !== 2 || sample.codecThreads !== 1
    || sample.scope !== "after-normal-cur-picture-release" || !Array.isArray(sample.pools)
    || sample.pools.length !== 5) return unavailable;
  const names = ["mbskip", "qscale", "mbtype", "motion", "refindex"], identities = new Set(), pools = [];
  let requestedLiveBytes = 0, requestedCachedBytes = 0;
  for (let i = 0; i < 5; i++) {
    const row = sample.pools[i];
    if (row?.name !== names[i] || typeof row.configured !== "boolean") return unavailable;
    if (!row.configured) {
      if (row.poolIdentity !== 0 || row.statisticsComplete !== false
        || [row.entryPayloadBytes, row.entryRequestedAllocationBytes, row.checkedOutEntries, row.cachedEntries]
          .some((value) => value !== null)) return unavailable;
      pools.push({ name: row.name, configured: false, requestedLiveBytes: null, requestedCachedBytes: null });
      continue;
    }
    if (!Number.isSafeInteger(row.poolIdentity) || row.poolIdentity <= 0 || row.poolIdentity > 0xffffffff
      || identities.has(row.poolIdentity)) return unavailable;
    identities.add(row.poolIdentity);
    const bytes = refstructSampleBytes({ ...row, kind: "refstruct-pool" });
    if (!bytes.available) return unavailable;
    requestedLiveBytes += bytes.requestedLiveBytes; requestedCachedBytes += bytes.requestedCachedBytes;
    if (!Number.isSafeInteger(requestedLiveBytes + requestedCachedBytes)) return unavailable;
    pools.push({ name: row.name, configured: true, ...bytes });
  }
  return { available: true, requestedLiveBytes, requestedCachedBytes, allocatorOverheadBytes: null, pools };
}
