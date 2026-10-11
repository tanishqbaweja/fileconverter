// Prospective observer only. The original tracker and ALL-tree250 gates remain.
import assert from "node:assert/strict";
import { startNativeBudgetFailureObserver } from "./native-budget-failure-observer.mjs";
import { startChromiumMemoryMonitor } from "./persistent-chromium-memory.mjs";
import { alignNativeReceiptClock, NATIVE_RECEIPT_CLOCK_LIMITS } from "./native-receipt-clock-fence.mjs";

export async function stopNativeObserverEvenAfterPhaseFailure(observer) {
  let phaseFailure = null, stopFailure = null;
  try { observer.setPhase("finally-cleanup"); } catch (error) { phaseFailure = error; }
  try { await observer.stop(); } catch (error) { stopFailure = error; }
  if (phaseFailure && stopFailure && phaseFailure !== stopFailure)
    throw new AggregateError([phaseFailure, stopFailure], "Observer phase and stop both failed");
  if (phaseFailure || stopFailure) throw phaseFailure ?? stopFailure;
}

export async function startClockFencedNativeBudgetFailureObserver(rootPid, temporary, options = {}) {
  const startMonitor = options.startMonitor ?? startChromiumMemoryMonitor;
  let lastBatch = null, monitorClosed = false;
  const fences = { limits: NATIVE_RECEIPT_CLOCK_LIMITS, batches: 0, waitedBatches: 0,
    maximumWaitMs: 0, maximumFirstAheadMs: 0, recentWaits: [], fenceFailure: null };
  const observer = await startNativeBudgetFailureObserver(rootPid, temporary, { ...options,
    startMonitor: async (...args) => {
      const monitor = await startMonitor(...args);
      return { ...monitor, async drain() {
        lastBatch = null;
        const received = await monitor.drain();
        assert.ok(Buffer.byteLength(JSON.stringify(received)) <= 8388608, "One bounded native batch only");
        lastBatch = received;
        let receipt;
        try { receipt = await alignNativeReceiptClock(lastBatch); }
        catch (error) { fences.fenceFailure = { name: error.name, message: error.message,
          code: error.code ?? null, receiptClock: error.receiptClock ?? null }; throw error; }
        fences.batches++;
        fences.maximumWaitMs = Math.max(fences.maximumWaitMs, receipt.waitedMs);
        fences.maximumFirstAheadMs = Math.max(fences.maximumFirstAheadMs, receipt.firstAheadMs);
        if (receipt.firstAheadMs > 0) {
          fences.waitedBatches++;
          fences.recentWaits.push(receipt); if (fences.recentWaits.length > 16) fences.recentWaits.shift();
        }
        return lastBatch;
      }, async close() { await monitor.close(); monitorClosed = true; } };
    },
  });
  const report = (includeFailedBatch) => ({ ...fences, recentWaits: fences.recentWaits.map(row => ({ ...row })),
    originalTimestampAssertionsUnchanged: true, samplesDropped: 0, timestampsRewritten: 0,
    maximumRetainedBatches: 1, monitorClosed,
    // Retain the fault payload ONCE, not in both native and callback reports.
    failedBatch: includeFailedBatch && observer.report().error ? lastBatch : null,
    failedBatchLocation: observer.report().error && lastBatch ? "nativeMemory.receiptClockFence.failedBatch" : null,
    failedBatchUnavailable: Boolean(observer.report().error && !lastBatch),
    historicalClockFailureCauseProven: false, publicAcceptance: false });
  return { ...observer,
    report: () => ({ ...observer.report(), receiptClockFence: report(true) }),
    failureCaptureReport: () => ({ ...observer.failureCaptureReport(), receiptClockFence: report(false) }),
  };
}
