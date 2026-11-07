// Private diagnostic, never qualification. No file contents, forced GC, changed
// baselines or process exclusions. Memory-infra allocator counters overlap.
import assert from "node:assert/strict";
import path from "node:path";
import { createBoundedDomCounterSampler } from "./bounded-dom-counters.mjs";
import { captureLiveMemoryInfra } from "./live-memory-infra.mjs";
import { boundedErrorDetails } from "./bounded-error-details.mjs";

export const DOCX_CLEANUP_PHASES = Object.freeze(["loaded", "before-large", "complete", "bound", "validated", "deleted", "cleanup-first", "cleanup-plus45s"]);
export function compactDocxMemoryInfra(value) {
  return { ...value, summary: value.summary.map(row => ({ ...row, processes: row.processes.map(process => {
    const { liveAllocatorCounters, ...compact } = process;
    void liveAllocatorCounters; return compact;
  }) })), detailedAllocatorBucketsInHashedTraceArchive: true };
}
export async function createDocxCleanupDiagnostic({ page, context, browser, realms, nativeSnapshot, archiveDirectory, stamp,
  capture = captureLiveMemoryInfra }) {
  assert.match(stamp, /^[0-9TZ.-]+$/);
  assert.ok(path.isAbsolute(archiveDirectory));
  const domSession = await context.newCDPSession(page), dom = createBoundedDomCounterSampler(domSession);
  const rows = []; let pending = false, closed = false;
  return {
    async sample(phase) {
      assert.equal(closed, false); assert.equal(pending, false, "No diagnostic queue");
      assert.equal(phase, DOCX_CLEANUP_PHASES[rows.length], "Finite ordered diagnostic phases");
      pending = true;
      const row = { phase, startedAt: new Date().toISOString(), acceptanceMetric: false };
      rows.push(row);
      try {
        row.nativeBefore = await nativeSnapshot();
        row.dom = await dom.sample(phase);
        row.realms = await realms.sample();
        row.memoryInfra = compactDocxMemoryInfra(await capture({ session: await browser.newBrowserCDPSession(), phase,
          processes: row.nativeBefore?.processes ?? null,
          archivePath: path.join(archiveDirectory, `${stamp}-docx-cleanup-${phase}.json.gz`) }));
        row.nativeAfter = await nativeSnapshot();
        return row;
      } catch (error) { row.errors = boundedErrorDetails(error); throw error; }
      finally { row.finishedAt = new Date().toISOString(); pending = false; }
    },
    report: () => ({ rows, maximumPhases: DOCX_CLEANUP_PHASES.length, maximumPending: 1, queuedCommands: 0,
      domObserver: dom.report(), perturbsMemory: true, acceptanceMetric: false, noForcedGc: true,
      sourceContentsCaptured: false, nativeTargetJoinVerified: false, allocationStackAttribution: false,
      caveat: "Diagnostic phase observations perturb timing/memory. Native trace PID/name and overlapping allocator counters are not allocation stacks or a page-target/native-birth join. First stable cleanup window is retained; later observation cannot replace it." }),
    async close() { if (closed) return; closed = true; dom.close(); await domSession.detach(); },
  };
}
