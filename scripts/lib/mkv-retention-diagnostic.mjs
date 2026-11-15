// Explicitly perturbing diagnostic; never a release-acceptance or GC sampler.
import assert from "node:assert/strict";
import { connectRealmSampler } from "./cdp-realm-memory.mjs";
import { createLifecycleAttribution } from "./lifecycle-allocation-attribution.mjs";

export const MKV_RETENTION_LIMITS = Object.freeze({ jobs: 6, checkpoints: 19, allocatorCheckpoints: 4, checkpointBytes: 65536 });
export async function createMkvRetentionDiagnostic({ root, reportBase, socketUrl, origin, browser, page, getProcesses }) {
  const realms = await connectRealmSampler(socketUrl, origin);
  let dom;
  try { dom = await page.context().newCDPSession(page); }
  catch (error) { realms.close(); throw error; }
  const checkpoints = [];
  let pending = null, closed = false, allocationCount = 0;
  const state = () => page.evaluate(() => {
    const s = window.__WITHIN_TEST__?.getState();
    return s ? { jobState: s.jobState, phase: s.phase, workerStatus: s.workerStatus, metrics: s.metrics } : null;
  });
  const allocation = createLifecycleAttribution({ root, reportBase,
    createSession: () => browser.newBrowserCDPSession(), getProcesses, getRealms: () => realms.sample(), getState: state });
  const report = () => ({ scope: "six-original-remux-retention-diagnostic-not-release-acceptance", limits: MKV_RETENTION_LIMITS,
    checkpoints, allocation: allocation.report(), realmOwnership: realms.ownershipSummary(), closed,
    maximumPending: 1, queuedRequests: 0, forcedGc: false, perturbsMemory: true, acceptanceMetric: false,
    allocationCallsiteCauseProven: false, primaryMemoryFormulaChanged: false });
  return {
    async capture(phase, allocators = false) {
      assert.equal(closed, false); assert.equal(pending, null); assert.match(phase, /^[a-z0-9-]{1,64}$/);
      assert.ok(checkpoints.length < MKV_RETENTION_LIMITS.checkpoints);
      const row = { phase, startedAt: Date.now(), state: null, realms: null, dom: null, processes: null, error: null };
      checkpoints.push(row);
      pending = (async () => {
        try {
          row.processes = await getProcesses(); assert.ok(row.processes.length <= 64);
          row.realms = await realms.sample(); row.dom = await dom.send("Memory.getDOMCounters"); row.state = await state();
          assert.ok(Buffer.byteLength(JSON.stringify(row)) <= MKV_RETENTION_LIMITS.checkpointBytes);
          if (allocators) {
            assert.ok(allocationCount++ < MKV_RETENTION_LIMITS.allocatorCheckpoints);
            const dump = await allocation.capture(phase);
            assert.equal(dump.error, null, "Allocator diagnostic failed; do not claim attribution");
          }
        } catch (error) { row.error = String(error).slice(0, 1024); }
        row.completedAt = Date.now(); return row;
      })();
      try { return await pending; } finally { pending = null; }
    },
    report,
    async close() {
      closed = true; await pending;
      try { await allocation.close(); await dom.detach(); }
      finally { realms.close(); }
      return report();
    },
  };
}
