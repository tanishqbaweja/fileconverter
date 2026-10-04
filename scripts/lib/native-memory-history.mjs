import assert from "node:assert/strict";
import { validateNativeBatch } from "./persistent-chromium-memory.mjs";

// Compact, lossless OS-sample history outside the browser. Never aggregates
// per-process maxima into a fictitious simultaneous tree peak.
export function createNativeMemoryHistory(rootPid) {
  const identities = [], identityIndexes = new Map(), timeline = [], transitions = [];
  let sequence = 0, cpuFirst = null, cpuLast = null;
  const setPhase = (phase, at = Date.now()) => {
    assert.match(phase, /^[a-z0-9-]{1,64}$/);
    assert.ok(Number.isFinite(at) && (!transitions.length || at >= transitions.at(-1).at));
    if (transitions.at(-1)?.phase !== phase) {
      assert.ok(transitions.length < 4096); transitions.push({ at, phase });
    }
  };
  const consume = (batch) => {
    sequence = validateNativeBatch(batch, rootPid, sequence);
    cpuFirst ??= batch.observerCpuMs; cpuLast = batch.observerCpuMs;
    for (const sample of batch.samples) {
      assert.ok(timeline.length < 32000, "Native memory history cap; no silent overwrite");
      const at = Date.parse(sample.timestamp);
      const phase = transitions.findLast((p) => p.at <= at)?.phase ?? "before-baseline";
      const rows = sample.processes?.map((p) => {
        const key = `${p.pid}:${p.creationFileTime}`;
        if (!identityIndexes.has(key)) {
          assert.ok(identities.length < 512, "Native process identity cap");
          identityIndexes.set(key, identities.length);
          identities.push({ pid: p.pid, parentPid: p.parentPid, createdAt: p.createdAt,
            creationFileTime: p.creationFileTime, executableName: p.executableName ?? null,
            type: p.type, utilitySubtype: p.utilitySubtype, sandboxType: p.sandboxType });
        }
        return [identityIndexes.get(key), p.privateBytes, p.rssBytes];
      }) ?? null;
      timeline.push([sample.sequence, sample.timestamp, phase, sample.privateBytes,
        sample.rssBytes, sample.nativeElapsedMs, sample.sampleError, rows]);
    }
  };
  const decode = (row) => row ? { sequence: row[0], timestamp: row[1], phase: row[2], privateBytes: row[3],
    rssBytes: row[4], nativeElapsedMs: row[5], sampleError: row[6],
    processes: row[7]?.map(([index, privateBytes, rssBytes]) => ({ ...identities[index], privateBytes, rssBytes })) ?? null } : null;
  const peaks = (phases) => {
    const selected = timeline.filter((r) => phases.includes(r[2]));
    const valid = selected.filter((r) => r[3] != null);
    const peak = valid.reduce((p, r) => p == null || r[3] > p[3] ? r : p, null);
    return { peak: decode(peak), peakRssBytes: valid.length ? Math.max(...valid.map((r) => r[4])) : null,
      validSamples: valid.length, unavailableSamples: selected.length - valid.length };
  };
  const report = () => ({ intervalMs: 100, scope: "Parallel read-only native observer; all unknown descendants counted; not conversion speed or zero-perturbation proof",
    observerCpuFirstMs: cpuFirst, observerCpuLastMs: cpuLast,
    observerCpuDeltaMs: cpuFirst != null && cpuLast != null ? cpuLast - cpuFirst : null,
    timelineColumns: ["sequence", "timestamp", "phase", "privateBytes", "rssBytes", "nativeElapsedMs", "sampleError", "processRows"],
    processRowColumns: ["identityIndex", "privateBytes", "rssBytes"], identities, timeline, transitions });
  return { setPhase, consume, peaks, report };
}

export function combinedTreePeak(cimPeak, nativePeak, baseline) {
  assert.ok(cimPeak > 0 && nativePeak > 0 && baseline > 0);
  const peakPrivateBytes = Math.max(cimPeak, nativePeak);
  return { peakPrivateBytes, incrementalPrivateMiB: (peakPrivateBytes - baseline) / 1024 ** 2 };
}
