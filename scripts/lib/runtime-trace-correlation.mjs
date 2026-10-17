import assert from "node:assert/strict";
// Clock sync command brackets are millisecond-resolution intervals, not exact
// timestamps. Preserve that uncertainty when joining OS UTC samples to trace time.
function utcMicroseconds(value) {
  assert.match(value, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$/);
  const fractional = value.match(/\.(\d+)Z$/)?.[1] ?? "";
  const seconds = Date.parse(value.replace(/\.\d+Z$/, "Z")); assert.ok(Number.isFinite(seconds));
  const microseconds = BigInt(seconds) * 1000n + BigInt(fractional.padEnd(7, "0")) / 10n;
  assert.ok(microseconds <= BigInt(Number.MAX_SAFE_INTEGER)); return Number(microseconds);
}
export function correlateRuntimeTrace(trace, capture, failure, rendererIdentity) {
  assert.equal(capture.error, null); assert.equal(capture.dataLossOccurred, false); assert.equal(capture.detached, true);
  assert.ok(capture.bufferUsageMaximum == null || capture.bufferUsageMaximum < 0.99);
  assert.equal(capture.budgetFailure.tracingAtNotification, true); assert.equal(capture.budgetFailure.nativeSequence, failure.after.sequence);
  const clockEvents = trace.traceEvents.filter(row => row.name === "clock_sync");
  let minimumOffset = -Infinity, maximumOffset = Infinity;
  const clocks = capture.markers.map(marker => {
    assert.equal(marker.error, null); assert.ok(marker.afterMs >= marker.beforeMs);
    const events = clockEvents.filter(row => row.args?.sync_id === marker.id); assert.equal(events.length, 1);
    const event = events[0]; assert.ok(Number.isFinite(event.ts));
    const lower = event.ts - (marker.afterMs + 1) * 1000, upper = event.ts - marker.beforeMs * 1000;
    minimumOffset = Math.max(minimumOffset, lower); maximumOffset = Math.min(maximumOffset, upper);
    return { id: marker.id, traceUs: event.ts, beforeMs: marker.beforeMs, afterMs: marker.afterMs, offsetUsRange: [lower, upper] };
  });
  assert.ok(clocks.length >= 2 && minimumOffset <= maximumOffset, "Clock brackets must have a consistent intersection");
  const range = timestamp => { const microseconds = utcMicroseconds(timestamp); return [microseconds + minimumOffset, microseconds + maximumOffset + 1]; };
  const before = range(failure.before.timestamp), after = range(failure.after.timestamp);
  const topTier = trace.traceEvents.filter(row => row.pid === rendererIdentity.pid && row.ph === "X" && row.name === "wasm.TopTierCompilation");
  const boundaries = topTier.flatMap(row => [{ timestamp: row.ts, delta: 1 }, { timestamp: row.ts + row.dur, delta: -1 }])
    .sort((a, b) => a.timestamp - b.timestamp || a.delta - b.delta);
  let concurrent = 0, peakConcurrent = 0; for (const point of boundaries) { concurrent += point.delta; peakConcurrent = Math.max(peakConcurrent, concurrent); }
  const duringJump = topTier.filter(row => row.ts < after[1] && row.ts + row.dur > before[0]);
  const atBudget = topTier.filter(row => row.ts < after[1] && row.ts + row.dur > after[0]);
  const lazy = trace.traceEvents.filter(row => row.pid === rendererIdentity.pid && row.ph === "X" && row.name === "wasm.CompileLazy");
  const gc = trace.traceEvents.filter(row => row.pid === rendererIdentity.pid && row.cat?.includes("disabled-by-default-v8.gc") && row.ts < after[1] && row.ts + (row.dur ?? 0) > before[0]);
  return { clocks, offsetUsRange: [minimumOffset, maximumOffset], nativeBeforeTraceUsRange: before, nativeBreachTraceUsRange: after,
    rendererIdentity, topTierEvents: topTier.length, topTierThreads: new Set(topTier.map(row => row.tid)).size,
    peakConcurrentTopTierEvents: peakConcurrent, lazyCompileCalls: lazy.length,
    topTierDuringNativeJump: duringJump.length, topTierPossiblyAtBreach: atBudget.map(({ tid, ts, dur }) => ({ tid, ts, dur })),
    gcEventsDuringJump: gc.length, gcNamesDuringJump: [...new Set(gc.map(row => row.name))],
    traceSaturated: false, timingCorrelationOnly: true, allocationBytesAttributed: null, allocationCauseProven: false };
}
