import assert from "node:assert/strict";
import { validateNativeBatch } from "./persistent-chromium-memory.mjs";

// Instrumentation outside Chromium. Keep every phase's true simultaneous tree
// peaks, but bound the graph to 4,096 one-second buckets even for multi-hour jobs.
// Evicted graph buckets never evict phase peaks or their process breakdowns.
export function createNativeMemoryPeaks(rootPid) {
  const identities = [], identityIndexes = new Map(), transitions = [];
  const phases = new Map(), buckets = new Array(4096);
  let bucketCount = 0, nextBucket = 0, currentBucket = null;
  let sequence = 0, lastAt = null, cpuFirst = null, cpuLast = null;
  const encode = (sample, phase) => [sample.sequence, sample.timestamp, phase,
    sample.privateBytes, sample.rssBytes, sample.nativeElapsedMs,
    sample.sampleError == null ? null : String(sample.sampleError).slice(0, 1024),
    sample.processes?.map((p) => {
      const key = `${p.pid}:${p.creationFileTime}`;
      if (!identityIndexes.has(key)) {
        assert.ok(identities.length < 512, "Native process identity cap");
        identityIndexes.set(key, identities.length);
        identities.push({ pid: p.pid, parentPid: p.parentPid, createdAt: p.createdAt,
          creationFileTime: p.creationFileTime, executableName: p.executableName ?? null,
          type: p.type, utilitySubtype: p.utilitySubtype, sandboxType: p.sandboxType });
      }
      return [identityIndexes.get(key), p.privateBytes, p.rssBytes];
    }) ?? null];
  const decode = (row) => row ? { sequence: row[0], timestamp: row[1], phase: row[2],
    privateBytes: row[3], rssBytes: row[4], nativeElapsedMs: row[5], sampleError: row[6],
    processes: row[7]?.map(([index, privateBytes, rssBytes]) => ({ ...identities[index], privateBytes, rssBytes })) ?? null } : null;
  const empty = (phase) => ({ phase, firstSequence: null, lastSequence: null,
    validSamples: 0, unavailableSamples: 0, peak: null, rssPeak: null, last: null, unavailableExamples: [] });
  const update = (aggregate, row) => {
    aggregate.firstSequence ??= row[0]; aggregate.lastSequence = row[0]; aggregate.last = row;
    if (row[3] == null) {
      aggregate.unavailableSamples++;
      if (aggregate.unavailableExamples.length < 8) aggregate.unavailableExamples.push(row);
    } else {
      aggregate.validSamples++;
      if (!aggregate.peak || row[3] > aggregate.peak[3]) aggregate.peak = row;
      if (!aggregate.rssPeak || row[4] > aggregate.rssPeak[4]) aggregate.rssPeak = row;
    }
  };
  const setPhase = (phase, at = Date.now()) => {
    assert.match(phase, /^[a-z0-9-]{1,64}$/);
    assert.ok(Number.isFinite(at) && (!transitions.length || at >= transitions.at(-1).at));
    if (transitions.at(-1)?.phase !== phase) {
      assert.ok(transitions.length < 256, "Native phase transition cap");
      transitions.push({ phase, at });
    }
    return at;
  };
  const consume = (batch) => {
    sequence = validateNativeBatch(batch, rootPid, sequence);
    assert.ok(cpuLast == null || batch.observerCpuMs >= cpuLast, "Observer CPU counter regressed");
    cpuFirst ??= batch.observerCpuMs; cpuLast = batch.observerCpuMs;
    for (const sample of batch.samples) {
      const at = Date.parse(sample.timestamp);
      assert.ok(lastAt == null || at >= lastAt, "Native acquisition time regressed"); lastAt = at;
      const phase = transitions.findLast((p) => p.at <= at)?.phase ?? "before-baseline";
      if (!phases.has(phase)) {
        assert.ok(phases.size < 128, "Native phase summary cap"); phases.set(phase, empty(phase));
      }
      const row = encode(sample, phase);
      update(phases.get(phase), row);
      const second = Math.floor(at / 1000);
      if (!currentBucket || currentBucket.second !== second || currentBucket.phase !== phase) {
        currentBucket = { ...empty(phase), second };
        buckets[nextBucket] = currentBucket; nextBucket = (nextBucket + 1) % buckets.length; bucketCount++;
      }
      update(currentBucket, row);
    }
  };
  const peaks = (selected) => {
    let peak = null, rssPeak = null, validSamples = 0, unavailableSamples = 0;
    for (const phase of selected) {
      const summary = phases.get(phase); if (!summary) continue;
      validSamples += summary.validSamples; unavailableSamples += summary.unavailableSamples;
      if (summary.peak && (!peak || summary.peak[3] > peak[3])) peak = summary.peak;
      if (summary.rssPeak && (!rssPeak || summary.rssPeak[4] > rssPeak[4])) rssPeak = summary.rssPeak;
    }
    return { peak: decode(peak), rssPeak: decode(rssPeak), peakRssBytes: rssPeak?.[4] ?? null,
      validSamples, unavailableSamples };
  };
  const report = () => ({ intervalMs: 100,
    scope: "All owned Chromium descendants; unknown types counted; native observer is not a converter or speed proof",
    sequence, lastAcquiredAt: lastAt, observerCpuFirstMs: cpuFirst, observerCpuLastMs: cpuLast,
    observerCpuDeltaMs: cpuFirst != null && cpuLast != null ? cpuLast - cpuFirst : null,
    limits: { identities: 512, phases: 128, transitions: 256, graphBuckets: 4096, unavailableExamplesPerAggregate: 8 },
    graphBucketDurationMs: 1000, graphBucketsEvicted: Math.max(0, bucketCount - buckets.length),
    rowColumns: ["sequence", "timestamp", "phase", "privateBytes", "rssBytes", "nativeElapsedMs", "sampleError", "processRows"],
    processRowColumns: ["identityIndex", "privateBytes", "rssBytes"], identities: [...identities], transitions: [...transitions],
    phases: [...phases.values()].map((p) => ({ ...p, unavailableExamples: [...p.unavailableExamples] })),
    graphBuckets: (bucketCount < buckets.length ? buckets.slice(0, bucketCount)
      : [...buckets.slice(nextBucket), ...buckets.slice(0, nextBucket)])
      .map((p) => ({ ...p, unavailableExamples: [...p.unavailableExamples] })),
  });
  return { setPhase, consume, peaks, report, lastAcquiredAt: () => lastAt };
}
