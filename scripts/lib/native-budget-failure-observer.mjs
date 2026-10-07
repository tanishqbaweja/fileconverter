// Read every actual native row; admit ONE diagnostic only after the unchanged
// full-tree250MiB budget fails. No tracing/GC/baseline substitution before it.
import assert from "node:assert/strict";
import { startParallelMemoryObserver } from "./parallel-memory-observer.mjs";
import { startChromiumMemoryMonitor, validateNativeBatch } from "./persistent-chromium-memory.mjs";
import { compareNativeSnapshots } from "./native-memory-bursts.mjs";
export const NATIVE_FAILURE_LIMITS = Object.freeze({ incrementalPrivateBytes: 250 * 1048576,
  maximumCallbacks: 1, drainIntervalMs: 100, maximumTransitions: 256 });
const copy = sample => ({ sequence: sample.sequence, timestamp: sample.timestamp,
  privateBytes: sample.privateBytes, rssBytes: sample.rssBytes, processes: sample.processes.map(p => ({ ...p })) });
export function createNativeBudgetFailureTracker(rootPid, getBlankBaseline) {
  assert.equal(typeof getBlankBaseline, "function");
  const transitions = [];
  let sequence = 0, lastAt = null, previous = null, previousPhase = null, firstFailure = null, baseline = null;
  let unavailableSamples = 0, additionalOverBudgetSamples = 0, evaluatedConversionSamples = 0;
  const setPhase = (phase, at = Date.now()) => {
    assert.match(phase, /^[a-z0-9-]{1,64}$/);
    assert.ok(Number.isFinite(at) && (!transitions.length || at >= transitions.at(-1).at));
    if (transitions.at(-1)?.phase !== phase) {
      assert.ok(transitions.length < NATIVE_FAILURE_LIMITS.maximumTransitions); transitions.push({ phase, at });
    }
  };
  return { setPhase,
    consume(batch, observedAt = Date.now()) {
      sequence = validateNativeBatch(batch, rootPid, sequence);
      const admitted = [];
      for (const sample of batch.samples) {
        const at = Date.parse(sample.timestamp);
        assert.ok(lastAt == null || at >= lastAt); assert.ok(observedAt >= at); lastAt = at;
        const phase = transitions.findLast(p => p.at <= at)?.phase ?? "before-baseline";
        if (sample.sampleError != null) { unavailableSamples++; previous = null; previousPhase = null; continue; }
        if (phase.startsWith("pre-conversion-") || phase.startsWith("conversion-")) {
          const actual = getBlankBaseline();
          assert.ok(actual?.stable === true && Number.isSafeInteger(actual.privateBytes) && actual.privateBytes > 0,
            "Actual stable blank is required; no missing baseline=zero");
          baseline ??= { ...actual }; assert.deepEqual(actual, baseline, "Never substitute the blank denominator");
          evaluatedConversionSamples++;
          const increment = sample.privateBytes - baseline.privateBytes;
          if (increment > NATIVE_FAILURE_LIMITS.incrementalPrivateBytes) {
            if (firstFailure) additionalOverBudgetSamples++;
            else {
              const before = previous && previousPhase === phase ? copy(previous) : null;
              firstFailure = { phase, observedAt, acquisitionLagMs: observedAt - at, baseline: { ...baseline },
                incrementalPrivateMiB: increment / 1048576, before, after: copy(sample),
                delta: before ? compareNativeSnapshots(before, sample) : null,
                cause: null, acceptanceMetric: false };
              admitted.push(firstFailure);
            }
          }
        }
        previous = copy(sample); previousPhase = phase;
      }
      return admitted;
    },
    report: () => ({ scope: "one-first-full-tree-budget-failure-only-not-every-burst-not-acceptance",
      limits: NATIVE_FAILURE_LIMITS, sequence, evaluatedConversionSamples, unavailableSamples,
      firstFailure, additionalOverBudgetSamples, denominator: baseline, acceptanceMetric: false }),
  };
}
export async function startNativeBudgetFailureObserver(rootPid, temporary, {
  getBlankBaseline, onFailure, startMonitor = startChromiumMemoryMonitor,
} = {}) {
  assert.equal(typeof onFailure, "function");
  const tracker = createNativeBudgetFailureTracker(rootPid, getBlankBaseline); tracker.setPhase("blank-baseline");
  let pending = null, callback = null, closing = false;
  const observer = await startParallelMemoryObserver(rootPid, temporary, {
    drainIntervalMs: NATIVE_FAILURE_LIMITS.drainIntervalMs,
    startMonitor: async (...args) => {
      const monitor = await startMonitor(...args);
      return { ...monitor, async drain() {
        const batch = await monitor.drain();
        for (const event of tracker.consume(batch)) {
          callback = { sequence: event.after.sequence, requestedAt: Date.now(), finishedAt: null,
            status: closing ? "not-captured-after-finalization-start" : "pending", result: null, error: null };
          if (closing) continue;
          pending = (async () => {
            try { callback.result = await onFailure(event); callback.status = "completed"; }
            catch (error) { callback.error = String(error).slice(0, 512); callback.status = "failed"; }
            finally { callback.finishedAt = Date.now(); }
          })();
        }
        return batch;
      } };
    },
  });
  return { pid: observer.pid, healthy: observer.healthy, through: observer.through,
    peaks: observer.peaks, report: observer.report,
    setPhase(phase) { const at = observer.setPhase(phase); tracker.setPhase(phase, at); return at; },
    failureCaptureReport: () => ({ ...tracker.report(), callback: callback && { ...callback },
      maximumPendingCallbacks: 1, callbackQueueLength: 0, rawNativePeaksRemainComplete: true }),
    async finishCapture() {
      // Caller must invoke BEFORE stopping native acquisition. Continue counting
      // every process/row while the owned trace drains and closes.
      closing = true; if (pending) await pending; return this.failureCaptureReport();
    },
    async stop() {
      closing = true;
      try { if (pending) await pending; }
      finally { await observer.stop(); }
    },
  };
}
