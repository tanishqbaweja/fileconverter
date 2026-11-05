// Private, perturbing attribution only. Never substitutes for OS private bytes.
import assert from "node:assert/strict";
import path from "node:path";
import { captureLiveMemoryInfra } from "./live-memory-infra.mjs";
export const VP9_NATIVE_PHASES = Object.freeze(["loaded-idle", "candidate-disposed", "wasm-ready", "output-closed"]);
export function createVp9NativeAllocationDiagnostic({ root, createSession, sampleProcesses, capture = captureLiveMemoryInfra }) {
  assert.ok(path.isAbsolute(root));
  const checkpoints = []; let busy = false;
  return {
    report: () => ({ checkpoints, maximumCaptures: 4, maximumPending: 1, queuedRequests: 0,
      captureDeadlineMs: 2500, perturbsMemoryAndTiming: true, noForcedGc: true,
      allocationStackAttribution: false, summedAllocatorTotal: null, acceptanceMetric: false }),
    async capture(label) {
      if (!VP9_NATIVE_PHASES.includes(label)) return false;
      assert.equal(busy, false, "Native snapshots may not overlap or queue");
      assert.ok(checkpoints.length < 4 && !checkpoints.some(row => row.label === label), "No duplicate native snapshot");
      busy = true;
      const row = { label, startedAt: new Date().toISOString(), finishedAt: null, processSample: null, result: null, error: null };
      checkpoints.push(row);
      try {
        row.processSample = await sampleProcesses();
        assert.ok(Array.isArray(row.processSample.processes) && row.processSample.processes.length > 0 && row.processSample.processes.length <= 64);
        // Capture owns/detaches the CDP session even on failure or deadline.
        row.result = await capture({ session: await createSession(), phase: label,
          processes: row.processSample.processes, captureMs: 2500,
          archivePath: path.join(root, "evidence", `2026-11-05-webcodecs-vp9-native-allocation-${label}.trace.json.gz`) });
        return true;
      } catch (error) { row.error = String(error).slice(0, 1024); throw error; }
      finally { row.finishedAt = new Date().toISOString(); busy = false; }
    },
  };
}
