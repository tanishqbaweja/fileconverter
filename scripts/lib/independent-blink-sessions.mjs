// One independently closed detailed trace per request. Private instrumentation
// only: full-tree native sampling must continue during start/dump/stop/read.
import assert from "node:assert/strict";
export const INDEPENDENT_BLINK_LIMITS = Object.freeze({ maximumSessions: 7, maximumRetainedReportBytes: 4 * 1048576 });
export function createIndependentBlinkSessions({ createSession, startAttribution, realms }) {
  assert.equal(typeof createSession, "function"); assert.equal(typeof startAttribution, "function");
  const sessions = [];
  let pending = null, closing = false, stopped = null;
  const report = () => ({ scope: "independent-single-detailed-largest64-traces-not-acceptance",
    status: sessions.length && sessions.every(row => row.trace?.status === "completed-diagnostic" && !row.error && row.sessionDetached)
      ? "completed-diagnostic" : "failed-diagnostic",
    limits: INDEPENDENT_BLINK_LIMITS, sessions,
    dumps: sessions.flatMap(row => row.trace?.dumps ?? []),
    allocatorSummary: sessions.flatMap(row => row.trace?.allocatorSummary ?? []),
    noQueuedRequests: true, maximumPendingSessions: 1, perturbsMemory: true, acceptanceMetric: false,
    rawTraceRetained: false, summedAllocatorTotal: null });
  return {
    async dump(phase, processes = null) {
      assert.equal(closing, false, "Independent attribution is closing");
      assert.equal(pending, null, "No queued or concurrent attribution sessions");
      assert.ok(sessions.length < INDEPENDENT_BLINK_LIMITS.maximumSessions, "Independent session cap");
      assert.equal(typeof phase, "string"); assert.ok(phase.length <= 128);
      const row = { phase, startedAt: new Date().toISOString(), finishedAt: null,
        trace: null, error: null, sessionDetached: false };
      sessions.push(row);
      const operation = (async () => {
        let session, attribution, reply;
        try {
          session = await createSession(); attribution = await startAttribution(session, realms);
          reply = await attribution.dump(phase, processes);
        } catch (error) { row.error = String(error).slice(0, 512); }
        finally {
          try { if (attribution) row.trace = await attribution.stop(); }
          catch (error) { row.error ??= String(error).slice(0, 512); }
          try { if (session) { await session.detach(); row.sessionDetached = true; } }
          catch (error) { row.error ??= String(error).slice(0, 512); }
          row.finishedAt = new Date().toISOString();
        }
        assert.ok(Buffer.byteLength(JSON.stringify(report())) <= INDEPENDENT_BLINK_LIMITS.maximumRetainedReportBytes,
          "Independent compact report cap; no unbounded trace history");
        return { success: row.trace?.status === "completed-diagnostic" && reply?.success === true && !row.error && row.sessionDetached,
          dumpGuid: reply?.dumpGuid ?? null, sessionIndex: sessions.length - 1,
          error: row.error, traceStatus: row.trace?.status ?? null };
      })();
      pending = operation;
      try { return await operation; } finally { pending = null; }
    },
    stop() {
      closing = true;
      stopped ??= (async () => { if (pending) await pending; return report(); })();
      return stopped;
    },
    report,
  };
}
