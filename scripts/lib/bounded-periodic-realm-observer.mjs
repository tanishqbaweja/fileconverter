// Diagnostic realm samples only. No GC, page evaluation, file data, private-byte
// substitution or process filtering. One sampler operation and a fixed ring.
import assert from "node:assert/strict";

export function createBoundedPeriodicRealmObserver({ sample, readPhase, intervalMs = 250, capacity = 256,
  clock = Date.now, scheduler = { setInterval, clearInterval } }) {
  assert.equal(typeof sample, "function"); assert.equal(typeof readPhase, "function");
  assert.ok(Number.isInteger(intervalMs) && intervalMs >= 250 && intervalMs <= 5000);
  assert.ok(Number.isInteger(capacity) && capacity > 0 && capacity <= 256);
  const rows = [], peaks = new Map();
  let timer, pending = null, closed = false, totalSamples = 0, skippedTicks = 0, droppedSamples = 0;
  const observe = () => {
    if (pending) return pending;
    if (closed) return Promise.resolve(null);
    const startedAt = clock(), phase = readPhase();
    pending = (async () => {
      let value = null, error = null;
      try {
        value = await sample();
        assert.ok(value && typeof value.targetsAvailable === "boolean");
        assert.ok(value.targets === null || (Array.isArray(value.targets) && value.targets.length <= 16));
        assert.equal(value.targetsAvailable, Array.isArray(value.targets));
        assert.ok(Buffer.byteLength(JSON.stringify(value)) <= 16384, "Realm observation metadata cap");
        const ids = new Set();
        for (const target of value.targets ?? []) {
          assert.ok(typeof target.targetId === "string" && target.targetId.length <= 128);
          assert.ok(typeof target.url === "string" && target.url.length <= 2048);
          assert.equal(ids.has(target.targetId), false); ids.add(target.targetId);
        }
        assert.ok(peaks.size + [...ids].filter(id => !peaks.has(id)).length <= 128, "Observed realm identity cap");
        // Validate the entire observation before committing ANY derived peaks.
        for (const target of value.targets ?? []) {
          if (!peaks.has(target.targetId)) {
            peaks.set(target.targetId, { targetId: target.targetId, type: target.type, firstSeenUrl: target.url,
              usedJSHeapBytes: null, allocatedJSHeapBytes: null, embedderHeapUsedBytes: null, backingStorageBytes: null });
          }
          const peak = peaks.get(target.targetId);
          peak.lastSeenUrl = target.url;
          for (const field of ["usedJSHeapBytes", "allocatedJSHeapBytes", "embedderHeapUsedBytes", "backingStorageBytes"]) {
            const number = target[field];
            if (typeof number === "number" && Number.isFinite(number) && number >= 0 && (peak[field] === null || number > peak[field])) {
              peak[field] = number; peak[field + "ObservedAt"] = startedAt;
            }
          }
        }
      } catch (reason) { value = null; error = String(reason).slice(0, 512); }
      const row = { startedAt, completedAt: clock(), phase, sample: value, error };
      totalSamples++;
      if (rows.length === capacity) { rows.shift(); droppedSamples++; }
      rows.push(row); return row;
    })().finally(() => { pending = null; });
    return pending;
  };
  return {
    observe,
    start() {
      assert.equal(closed, false);
      if (timer !== undefined) return;
      timer = scheduler.setInterval(() => { if (pending) { skippedTicks++; return; } void observe(); }, intervalMs);
    },
    async stop() {
      closed = true;
      if (timer !== undefined) { scheduler.clearInterval(timer); timer = undefined; }
      await pending;
    },
    report() {
      return { scope: "Bounded sampled realm observations, not guaranteed exact realm peaks or replacement native private bytes",
        intervalMs, capacity, maximumPendingOperations: 1, maximumTargetsPerSample: 16, maximumObservedRealmIdentities: 128,
        maximumSampleMetadataBytes: 16384, totalSamples, skippedTicks, droppedSamples,
        samples: [...rows], observedPeaks: [...peaks.values()], forcedGc: false };
    },
  };
}
