// Changed private instrumentation. The old acceptance observer and historical
// source pins are untouched. Same 100ms native acquisition and all-tree peaks;
// faster drains plus one asynchronous diagnostic callback, with NO callback queue.
import assert from "node:assert/strict";
import { startParallelMemoryObserver } from "./parallel-memory-observer.mjs";
import { startChromiumMemoryMonitor } from "./persistent-chromium-memory.mjs";
import { BURST_LIMITS, createNativeBurstTracker } from "./native-memory-bursts.mjs";

export async function startBurstMemoryObserver(rootPid, temporary, {
  startMonitor = startChromiumMemoryMonitor, onBurst,
  minimumIncreaseBytes = BURST_LIMITS.minimumIncreaseBytes,
  shouldDispatch = phase => phase.startsWith("conversion-") || phase === "allocation-control",
} = {}) {
  assert.equal(typeof onBurst, "function");
  const tracker = createNativeBurstTracker(rootPid, { minimumIncreaseBytes });
  tracker.setPhase("blank-baseline");
  let pending = null, stopping = null, stoppingRequested = false;
  const callbacks = [];
  const dispatch = event => {
    if (!shouldDispatch(event.phase)) return;
    const row = { sequence: event.after.sequence, requestedAt: Date.now(),
      acquisitionLagMs: Date.now() - Date.parse(event.after.timestamp),
      status: stoppingRequested ? "skipped-stopping" : pending ? "skipped-busy-no-queue" : "pending",
      finishedAt: null, result: null, error: null };
    callbacks.push(row); // At most eight admitted burst events.
    if (row.status !== "pending") return;
    pending = (async () => {
      try { row.result = await onBurst(event); row.status = "completed"; }
      catch (error) { row.error = String(error).slice(0, 512); row.status = "failed"; }
      finally { row.finishedAt = Date.now(); }
    })();
    // Clearing is chained after assignment, including synchronous callback errors.
    pending = pending.finally(() => { pending = null; });
  };
  const observer = await startParallelMemoryObserver(rootPid, temporary, {
    drainIntervalMs: BURST_LIMITS.drainIntervalMs,
    startMonitor: async (...args) => {
      const monitor = await startMonitor(...args);
      return { ...monitor, async drain() {
        const batch = await monitor.drain();
        for (const event of tracker.consume(batch)) dispatch(event);
        return batch;
      } };
    },
  });
  return { pid: observer.pid, healthy: observer.healthy, through: observer.through,
    peaks: observer.peaks, report: observer.report,
    setPhase(phase) { const at = observer.setPhase(phase); tracker.setPhase(phase, at); return at; },
    burstReport: () => ({ ...tracker.report(), callbacks: callbacks.map(row => ({ ...row })),
      maximumPendingCallbacks: 1, callbackQueueLength: 0,
      diagnosticPerturbsMemory: true, acceptanceMetric: false }),
    stop() {
      stoppingRequested = true;
      stopping ??= (async () => {
        try { await observer.stop(); }
        finally { if (pending) await pending; }
      })();
      return stopping;
    },
  };
}
