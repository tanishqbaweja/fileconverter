// Additive sidecar around the exact original clock/phase/budget observer.
import assert from "node:assert/strict";
import { startClockFencedNativeBudgetFailureObserver as startOriginal } from "./clock-fenced-native-failure-observer.mjs";
import { startChromiumMemoryMonitor } from "./persistent-chromium-memory.mjs";
import { queryProcessIdentity } from "./owned-process-exit-observation.mjs";
import { createDurableNativeMemoryJournal } from "./durable-native-memory-journal.mjs";
export { stopNativeObserverEvenAfterPhaseFailure } from "./clock-fenced-native-failure-observer.mjs";

export async function startClockFencedNativeBudgetFailureObserver(rootPid, temporary, options = {}) {
  assert.equal(typeof options.checkpointPath, "string", "Explicit repository-local sidecar required");
  const journal = await createDurableNativeMemoryJournal(rootPid, options.checkpointPath, { getBlankBaseline: options.getBlankBaseline });
  const startMonitor = options.startMonitor ?? startChromiumMemoryMonitor;
  let observer;
  try {
    observer = await startOriginal(rootPid, temporary, { ...options, startMonitor: async (...args) => {
      const monitor = await startMonitor(...args);
      try {
        const [rootIdentity, monitorIdentity] = await Promise.all([queryProcessIdentity(rootPid), queryProcessIdentity(monitor.pid)]);
        assert.ok(rootIdentity && monitorIdentity, "Missing births are unavailable, not owned identity proof");
        journal.setIdentities(rootIdentity, monitorIdentity);
        return { ...monitor, async drain() {
          const batch = await monitor.drain();
          journal.consume(batch); return batch; // Identical batch goes to original fence/tracker/peaks.
        } };
      } catch (error) { await monitor.close(); throw error; }
    } });
  } catch (error) {
    try { await journal.close(); } catch (closeError) { throw new AggregateError([error, closeError], "Observer/journal startup failed"); }
    throw error;
  }
  return { ...observer,
    healthy() { observer.healthy(); journal.healthy(); },
    setPhase(phase) { const at = observer.setPhase(phase); journal.setPhase(phase, at); return at; },
    async through(at) { await observer.through(at); await journal.flush(); },
    report: () => ({ ...observer.report(), durableCheckpoint: journal.report() }),
    async flushCheckpoint() { await journal.flush(); },
    async stop() {
      let stopError = null;
      try { await observer.stop(); } catch (error) { stopError = error; }
      try { await journal.close(); } catch (error) {
        if (stopError) throw new AggregateError([stopError, error], "Observer and durable checkpoint closure failed");
        throw error;
      }
      if (stopError) throw stopError;
    },
  };
}
