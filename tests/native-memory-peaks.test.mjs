import assert from "node:assert/strict";
import test from "node:test";
import { createNativeMemoryPeaks } from "../scripts/lib/native-memory-peaks.mjs";
import { startParallelMemoryObserver } from "../scripts/lib/parallel-memory-observer.mjs";

const start = Date.parse("2026-10-05T01:00:00Z");
const sample = (sequence, at, childBytes = 20, rssBytes = 40) => ({ sequence,
  timestamp: new Date(at).toISOString(), completedAt: new Date(at + 2).toISOString(), nativeElapsedMs: 2,
  sampleError: null, privateBytes: 10 + childBytes, rssBytes, processes: [
    { pid: 1, parentPid: 0, createdAt: "2026-10-04T16:00:00Z", creationFileTime: "134040000000000000", privateBytes: 10, rssBytes: 20 },
    { pid: 2, parentPid: 1, createdAt: "2026-10-04T16:00:01Z", creationFileTime: "134040000010000000", privateBytes: childBytes, rssBytes: rssBytes - 20 },
  ] });
const batch = (samples, observerCpuMs = 5) => ({ overflow: false, observerCpuMs, samples });

test("bounded long history evicts graph buckets but never loses an early whole-tree phase peak", () => {
  const h = createNativeMemoryPeaks(1); h.setPhase("conversion-1", start);
  // 60,000 readings model a 100-minute job, longer than the old 32k cap.
  for (let offset = 0; offset < 60_000; offset += 100) {
    h.consume(batch(Array.from({ length: 100 }, (_, i) => {
      const n = offset + i + 1; return sample(n, start + n * 100, n === 2 ? 1000 : 20, n === 4 ? 2000 : 40);
    }), offset));
  }
  const p = h.peaks(["conversion-1"]), r = h.report();
  assert.equal(p.peak.privateBytes, 1010); assert.equal(p.peak.sequence, 2);
  assert.equal(p.peak.processes.reduce((sum, p) => sum + p.privateBytes, 0), 1010);
  assert.equal(p.rssPeak.sequence, 4); assert.equal(p.peakRssBytes, 2000);
  assert.equal(p.validSamples, 60_000); assert.equal(r.sequence, 60_000);
  assert.equal(r.graphBuckets.length, 4096); assert.equal(r.graphBucketsEvicted, 1905);
  assert.equal(r.phases[0].peak[0], 2); assert.equal(r.identities.length, 2);
  assert.equal(r.graphBuckets.at(-1).lastSequence, 60_000);
  assert.equal(p.peak.processes[1].type, "unknown");
});

test("late drains retain acquisition phases, null failures and separately simultaneous RSS peaks", () => {
  const h = createNativeMemoryPeaks(1); h.setPhase("conversion-1", start); h.setPhase("validation-1", start + 2000);
  const failed = { ...sample(2, start + 1200), sampleError: "Unavailable", privateBytes: null, rssBytes: null, processes: null };
  h.consume(batch([sample(1, start + 1000, 100), failed, sample(3, start + 2100, 2000)]));
  assert.equal(h.peaks(["conversion-1"]).peak.privateBytes, 110);
  assert.equal(h.peaks(["conversion-1"]).unavailableSamples, 1);
  assert.equal(h.report().phases[0].unavailableExamples[0][3], null);
  assert.equal(h.peaks(["validation-1"]).peak.privateBytes, 2010);
  assert.throws(() => h.consume({ ...batch([]), overflow: true }), /overflow/);
});

test("phase gaps and time regression fail rather than silently discard memory observations", () => {
  const h = createNativeMemoryPeaks(1); h.setPhase("conversion-1", start);
  h.consume(batch([sample(1, start + 1000)]));
  assert.throws(() => h.consume(batch([sample(3, start + 1100)])), /Missing/);
  const t = createNativeMemoryPeaks(1); t.consume(batch([sample(1, start + 1000)]));
  assert.throws(() => t.consume(batch([sample(2, start + 900)])), /regressed/);
});

test("a serial independent pump keeps draining across long caller waits and stop is idempotent", async () => {
  let sequence = 0, concurrent = 0, maximumConcurrent = 0, closed = 0;
  const observer = await startParallelMemoryObserver(1, "unused", {
    drainIntervalMs: 5,
    startMonitor: async () => ({ pid: 44,
      async drain() {
        concurrent++; maximumConcurrent = Math.max(maximumConcurrent, concurrent);
        await new Promise((r) => setTimeout(r, 2)); concurrent--;
        return batch([sample(++sequence, Date.now(), sequence === 2 ? 900 : 20)], sequence);
      }, async close() { closed++; },
    }),
  });
  try {
    observer.setPhase("conversion-1");
    const deadline = Date.now() + 2000;
    while (sequence < 6 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 5));
    const at = observer.setPhase("validation-1"); await observer.through(at);
    assert.ok(sequence > 4); assert.equal(observer.peaks(["conversion-1"]).peak.privateBytes, 910);
  } finally { await Promise.all([observer.stop(), observer.stop()]); }
  assert.equal(maximumConcurrent, 1); assert.equal(closed, 1);
  assert.equal(observer.report().error, null);
});

test("pump/flush failures cannot accept CIM alone and always close the native helper", async () => {
  let closed = false;
  const observer = await startParallelMemoryObserver(1, "unused", {
    drainIntervalMs: 1, startMonitor: async () => ({ pid: 44,
      async drain() { throw new Error("native unavailable"); }, async close() { closed = true; },
    }),
  });
  await assert.rejects(observer.through(Date.now()), /native unavailable/);
  await assert.rejects(observer.stop(), /native unavailable/); assert.equal(closed, true);
  assert.equal(observer.report().error, "native unavailable");
  const empty = await startParallelMemoryObserver(1, "unused", {
    drainIntervalMs: 1, flushTimeoutMs: 30, startMonitor: async () => ({ pid: 44,
      async drain() { return batch([]); }, async close() {},
    }),
  });
  await assert.rejects(empty.through(Date.now()), /no CIM-only acceptance fallback/);
  await empty.stop();
});
