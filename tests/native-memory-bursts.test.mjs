import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BURST_LIMITS, compareNativeSnapshots, createNativeBurstTracker, inspectRetainedPeakNeighbors } from "../scripts/lib/native-memory-bursts.mjs";
import { startBurstMemoryObserver } from "../scripts/lib/burst-memory-observer.mjs";
const MiB = 1048576, start = Date.parse("2026-10-07T00:00:00Z");
const sample = (sequence, at, rendererBytes = 20 * MiB, birth = "134040000010000000") => ({ sequence,
  timestamp: new Date(at).toISOString(), completedAt: new Date(at + 2).toISOString(), nativeElapsedMs: 2,
  sampleError: null, privateBytes: 10 * MiB + rendererBytes, rssBytes: 15 * MiB + rendererBytes,
  processes: [
    { pid: 1, parentPid: 0, createdAt: "2026-10-04T16:00:00Z", creationFileTime: "134040000000000000", privateBytes: 10 * MiB, rssBytes: 15 * MiB },
    { pid: 2, parentPid: 1, createdAt: "2026-10-04T16:00:01Z", creationFileTime: birth, privateBytes: rendererBytes, rssBytes: rendererBytes },
  ] });
const batch = samples => ({ samples, overflow: false, observerCpuMs: 0 });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate) {
  const deadline = Date.now() + 3000;
  while (!predicate() && Date.now() < deadline) await pause(5);
  assert.ok(predicate(), "Test observation deadline");
}

test("native bursts retain every simultaneous process and identify adjacent positive deltas across drains", () => {
  const tracker = createNativeBurstTracker(1); tracker.setPhase("conversion-1", start);
  assert.deepEqual(tracker.consume(batch([sample(1, start)]), start + 10), []);
  const [burst] = tracker.consume(batch([sample(2, start + 100, 60 * MiB)]), start + 140);
  assert.equal(burst.delta.treeDeltaPrivateBytes, 40 * MiB); assert.equal(burst.delta.adjacent, true);
  assert.equal(burst.delta.processDeltas.length, 2);
  assert.equal(burst.delta.processDeltas[0].deltaPrivateBytes, 0);
  assert.equal(burst.delta.processDeltas[1].deltaPrivateBytes, 40 * MiB);
  assert.equal(burst.acquisitionLagMs, 40); assert.equal(burst.after.processes[1].type, "unknown");
  assert.equal(burst.delta.allocationSource, null); assert.equal(tracker.report().acceptanceMetric, false);
});
test("unavailable rows and phase boundaries are never replaced with zero or bridged into a fake burst", () => {
  const tracker = createNativeBurstTracker(1); tracker.setPhase("conversion-1", start);
  const failed = { ...sample(2, start + 100), privateBytes: null, rssBytes: null, processes: null, sampleError: "Unavailable" };
  tracker.consume(batch([sample(1, start), failed, sample(3, start + 200, 60 * MiB)]), start + 250);
  tracker.setPhase("validation-1", start + 300);
  tracker.consume(batch([sample(4, start + 400, 100 * MiB)]), start + 450);
  assert.equal(tracker.report().events.length, 0); assert.equal(tracker.report().unavailableSamples, 1);
  assert.throws(() => tracker.consume({ ...batch([]), overflow: true }), /overflow/);
});
test("a reused PID or new process has a null delta, not an invented zero baseline", () => {
  const result = compareNativeSnapshots(sample(1, start), sample(2, start + 100, 80 * MiB, "134040000020000000"));
  assert.equal(result.treeDeltaPrivateBytes, 60 * MiB);
  assert.equal(result.processDeltas[1].beforePrivateBytes, null);
  assert.equal(result.processDeltas[1].deltaPrivateBytes, null);
  assert.equal(result.addedIdentities.length, 1); assert.equal(result.removedIdentities.length, 1);
});
test("long jobs have fixed burst retention and record discarded events, never an unbounded history", () => {
  const tracker = createNativeBurstTracker(1); tracker.setPhase("conversion-1", start);
  for (let i = 1; i <= 1000; i++) tracker.consume(batch([sample(i, start + i * 100, (20 + i * 20) * MiB)]), start + i * 100 + 25);
  const report = tracker.report();
  assert.equal(report.events.length, BURST_LIMITS.maximumEvents);
  assert.equal(report.eventsDiscarded, 991); assert.equal(report.sequence, 1000);
  assert.throws(() => tracker.consume(batch([sample(1002, start + 100100)]), start + 100200), /Missing/);
});
test("native diagnostic callbacks do not delay draining or enqueue a second request; stop awaits the owned request", async () => {
  let sequence = 0, closed = 0, calls = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  const observer = await startBurstMemoryObserver(1, "unused", {
    shouldDispatch: () => true,
    startMonitor: async () => ({ pid: 44,
      async drain() { return batch([sample(++sequence, Date.now(), (20 + sequence * 20) * MiB)]); },
      async close() { closed++; },
    }),
    onBurst: async () => { calls++; await gate; return { memoryDump: "synthetic" }; },
  });
  try {
    await until(() => sequence >= 4);
    assert.equal(calls, 1); assert.equal(observer.burstReport().callbackQueueLength, 0);
    assert.ok(observer.burstReport().callbacks.some(row => row.status === "skipped-busy-no-queue"));
    let stopped = false; const stop = observer.stop().then(() => { stopped = true; });
    await pause(120); assert.equal(stopped, false); assert.equal(closed, 1);
    release(); await stop; await observer.stop(); assert.equal(closed, 1);
    assert.equal(observer.burstReport().callbacks[0].status, "completed");
    assert.ok(observer.report().phases[0].peak[3] >= 90 * MiB);
  } finally { release(); await observer.stop(); }
});
test("callback errors are explicit diagnostics and native observer failure still closes its helper", async () => {
  let sequence = 0, closed = 0;
  const observer = await startBurstMemoryObserver(1, "unused", {
    shouldDispatch: () => true,
    startMonitor: async () => ({ pid: 44,
      async drain() {
        if (sequence === 3) throw new Error("native unavailable");
        return batch([sample(++sequence, Date.now(), (20 + sequence * 20) * MiB)]);
      }, async close() { closed++; },
    }), onBurst() { throw new Error("dump unavailable"); },
  });
  await until(() => observer.report().error != null);
  await assert.rejects(observer.stop(), /native unavailable/); assert.equal(closed, 1);
  assert.equal(observer.burstReport().callbacks[0].status, "failed");
  assert.match(observer.burstReport().callbacks[0].error, /dump unavailable/);
});
test("retained historical buckets distinguish adjacent neighbors from missing 100ms rows", () => {
  const before = sample(1, start), peak = { ...sample(2, start + 100, 80 * MiB), phase: "conversion-1" };
  const after = { ...sample(8, start + 700, 30 * MiB), phase: "conversion-1" };
  const encode = sample => [sample.sequence, sample.timestamp, "conversion-1", sample.privateBytes,
    sample.rssBytes, 2, null, sample.processes.map((p, i) => [i, p.privateBytes, p.rssBytes])];
  const native = { identities: before.processes, phases: [], rowColumns: ["sequence", "timestamp", "phase", "privateBytes", "rssBytes", "nativeElapsedMs", "sampleError", "processRows"],
    graphBuckets: [{ peak: encode(peak), last: encode(before) }, { peak: encode(after), last: encode(after) }] };
  const result = inspectRetainedPeakNeighbors(native, peak);
  assert.equal(result.increase.adjacent, true); assert.equal(result.laterDecrease.adjacent, false);
  assert.equal(result.laterDecrease.treeDeltaPrivateBytes, -50 * MiB);
  assert.match(result.retentionCaveat, /No exact spike duration/);
});
test("actual original renderer burst proof retains all nine processes, unknown cause and exact source pins", async () => {
  const proof = JSON.parse(await readFile(new URL("../evidence/original-renderer-burst-2026-10-07.json", import.meta.url)));
  assert.equal(proof.neighbors.before.sequence, 34486); assert.equal(proof.neighbors.peak.sequence, 34487);
  assert.equal(proof.neighbors.increase.adjacent, true); assert.equal(proof.neighbors.increase.treeDeltaPrivateBytes, 59551744);
  assert.equal(proof.neighbors.peak.processes.length, 9); assert.equal(proof.treeIncreaseMiB, 59551744 / MiB);
  assert.equal(proof.neighbors.laterDecrease.treeDeltaPrivateBytes, -53792768);
  assert.equal(proof.neighbors.laterDecrease.processDeltas.find(p => p.pid === 38208).deltaPrivateBytes, -53813248);
  assert.equal(proof.allocationSource, null); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.browserConversionsStarted, 0); assert.equal(proof.originalRead, false);
  for (const [file, digest] of Object.entries(proof.sourcePins))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), digest, file);
});
