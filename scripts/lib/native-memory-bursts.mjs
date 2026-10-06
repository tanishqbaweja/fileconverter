// Diagnostic only: adjacent native observations identify process deltas, not
// objects/callsites. Keep the complete simultaneous tree; never invent zeroes
// for unavailable measurements or for newly created/reused process identities.
import assert from "node:assert/strict";
import { validateNativeBatch } from "./persistent-chromium-memory.mjs";

export const BURST_LIMITS = Object.freeze({ minimumIncreaseBytes: 16 * 1048576,
  maximumEvents: 8, maximumTransitions: 256, drainIntervalMs: 100 });
const identity = p => `${p.pid}:${p.creationFileTime}`;
const copy = sample => ({ sequence: sample.sequence, timestamp: sample.timestamp,
  privateBytes: sample.privateBytes, rssBytes: sample.rssBytes,
  processes: sample.processes.map(p => ({ ...p })) });

export function compareNativeSnapshots(before, after) {
  for (const sample of [before, after]) {
    assert.ok(Number.isSafeInteger(sample.sequence) && sample.sequence > 0);
    assert.ok(Number.isFinite(Date.parse(sample.timestamp)));
    assert.ok(Number.isSafeInteger(sample.privateBytes) && sample.privateBytes > 0);
    assert.ok(Array.isArray(sample.processes) && sample.processes.length > 0 && sample.processes.length <= 128);
    assert.equal(new Set(sample.processes.map(identity)).size, sample.processes.length);
    assert.equal(sample.privateBytes, sample.processes.reduce((total, p) => {
      assert.ok(Number.isSafeInteger(p.privateBytes) && p.privateBytes > 0);
      assert.ok(Number.isSafeInteger(p.pid) && p.pid > 0);
      assert.match(p.creationFileTime, /^\d{17,19}$/);
      return total + p.privateBytes;
    }, 0));
  }
  assert.ok(after.sequence > before.sequence);
  const elapsedMs = Date.parse(after.timestamp) - Date.parse(before.timestamp);
  assert.ok(elapsedMs >= 0, "Native snapshot time regressed");
  const old = new Map(before.processes.map(p => [identity(p), p]));
  const current = new Map(after.processes.map(p => [identity(p), p]));
  const processDeltas = after.processes.map(p => ({ pid: p.pid, parentPid: p.parentPid,
    createdAt: p.createdAt, creationFileTime: p.creationFileTime,
    beforePrivateBytes: old.get(identity(p))?.privateBytes ?? null,
    afterPrivateBytes: p.privateBytes,
    deltaPrivateBytes: old.has(identity(p)) ? p.privateBytes - old.get(identity(p)).privateBytes : null }));
  return { beforeSequence: before.sequence, afterSequence: after.sequence,
    beforeTimestamp: before.timestamp, afterTimestamp: after.timestamp,
    adjacent: after.sequence === before.sequence + 1,
    // Date.parse has millisecond precision. Retain the original full timestamps.
    elapsedMs, elapsedPrecision: "milliseconds; original timestamps retained",
    treeDeltaPrivateBytes: after.privateBytes - before.privateBytes, processDeltas,
    addedIdentities: after.processes.filter(p => !old.has(identity(p))).map(identity),
    removedIdentities: before.processes.filter(p => !current.has(identity(p))).map(identity),
    allocationSource: null, acceptanceMetric: false };
}

export function createNativeBurstTracker(rootPid, { minimumIncreaseBytes = BURST_LIMITS.minimumIncreaseBytes } = {}) {
  assert.ok(Number.isSafeInteger(minimumIncreaseBytes) && minimumIncreaseBytes > 0);
  const transitions = [], events = [];
  let sequence = 0, previous = null, previousPhase = null, lastAt = null;
  let unavailableSamples = 0, eventsDiscarded = 0;
  const setPhase = (phase, at = Date.now()) => {
    assert.match(phase, /^[a-z0-9-]{1,64}$/);
    assert.ok(Number.isFinite(at) && (!transitions.length || at >= transitions.at(-1).at));
    if (transitions.at(-1)?.phase !== phase) {
      assert.ok(transitions.length < BURST_LIMITS.maximumTransitions, "Burst phase transition cap");
      transitions.push({ phase, at });
    }
    return at;
  };
  return { setPhase,
    consume(batch, observedAt = Date.now()) {
      sequence = validateNativeBatch(batch, rootPid, sequence);
      assert.ok(Number.isFinite(observedAt));
      const admitted = [];
      for (const sample of batch.samples) {
        const at = Date.parse(sample.timestamp);
        assert.ok(lastAt == null || at >= lastAt, "Native snapshot time regressed"); lastAt = at;
        assert.ok(observedAt >= at, "Observation cannot precede acquisition");
        const phase = transitions.findLast(p => p.at <= at)?.phase ?? "before-baseline";
        if (sample.sampleError != null) {
          unavailableSamples++; previous = null; previousPhase = null; continue;
        }
        if (previous && previousPhase === phase && sample.privateBytes - previous.privateBytes >= minimumIncreaseBytes) {
          if (events.length === BURST_LIMITS.maximumEvents) eventsDiscarded++;
          else {
            const event = { phase, observedAt, acquisitionLagMs: observedAt - at,
              before: copy(previous), after: copy(sample), delta: compareNativeSnapshots(previous, sample) };
            events.push(event); admitted.push(event);
          }
        }
        previous = copy(sample); previousPhase = phase;
      }
      return admitted;
    },
    report: () => ({ scope: "bounded-native-adjacent-burst-diagnostic-not-acceptance",
      limits: { ...BURST_LIMITS, minimumIncreaseBytes }, sequence, unavailableSamples,
      eventsDiscarded, events: [...events], allocationSource: null, acceptanceMetric: false }),
  };
}

// Historical graphs keep peak/RSS-peak/last per second, not all 100ms rows.
// Return only actually retained neighbors. A non-adjacent pair is not a burst.
export function inspectRetainedPeakNeighbors(nativeMemory, peak) {
  assert.ok(nativeMemory.graphBuckets.length <= 4096 && nativeMemory.phases.length <= 128);
  assert.ok(nativeMemory.identities.length <= 512);
  assert.deepEqual(nativeMemory.rowColumns,
    ["sequence", "timestamp", "phase", "privateBytes", "rssBytes", "nativeElapsedMs", "sampleError", "processRows"]);
  const rows = new Map();
  const decode = row => row && row[3] != null && row[6] == null ? { sequence: row[0],
    timestamp: row[1], phase: row[2], privateBytes: row[3], rssBytes: row[4],
    processes: row[7].map(([index, privateBytes, rssBytes]) => {
      assert.ok(nativeMemory.identities[index], "Missing native identity index");
      return { ...nativeMemory.identities[index], privateBytes, rssBytes };
    }) } : null;
  for (const aggregate of [...nativeMemory.graphBuckets, ...nativeMemory.phases]) {
    for (const key of ["peak", "rssPeak", "last"]) {
      const sample = decode(aggregate[key]);
      if (sample?.phase === peak.phase) rows.set(sample.sequence, sample);
    }
  }
  const ordered = [...rows.values()].sort((a, b) => a.sequence - b.sequence);
  const retainedPeak = rows.get(peak.sequence);
  assert.ok(retainedPeak, "Peak must be retained");
  assert.equal(retainedPeak.privateBytes, peak.privateBytes);
  const before = ordered.findLast(sample => sample.sequence < peak.sequence) ?? null;
  const after = ordered.find(sample => sample.sequence > peak.sequence) ?? null;
  return { peak: retainedPeak, before, after,
    increase: before ? compareNativeSnapshots(before, retainedPeak) : null,
    laterDecrease: after ? compareNativeSnapshots(retainedPeak, after) : null,
    retentionCaveat: "One-second buckets do not retain every 100ms row. No exact spike duration or allocation cause is inferred.",
    allocationSource: null, acceptanceMetric: false };
}
