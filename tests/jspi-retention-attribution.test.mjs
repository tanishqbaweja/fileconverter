import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { attributeJspiRetention, wmiBirthKey } from "../scripts/lib/jspi-retention-attribution.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-18T23-55-28-649Z-jspi-ssim-full-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path)));
test("actual native phase snapshots reconcile all process deltas without substituting stable baselines", () => {
  const result = attributeJspiRetention(report);
  assert.deepEqual(result.snapshots.map(row => row.privateBytes), [343584768, 360296448, 372334592, 375975936]);
  assert.equal(result.changes.at(-1).deltaBytes, 3641344);
  assert.equal(result.perProcess.find(row => row.pid === 3164).stepChangesBytes.at(-1), -2695168);
  assert.equal(result.perProcess.find(row => row.type === "gpu-process").stepChangesBytes.at(-1), 5357568);
  assert.equal(result.lastRendererDeltaBytes, -1646592);
  assert.equal(result.stableRecoveries[2].privateBytes, 375709696); // Not the375975936 phase-last snapshot.
  assert.equal(result.zeroPrivateGrowthProven, false); assert.equal(result.noLeakProven, false); assert.equal(result.allocationCause, null);
  assert.equal(result.compiledModuleCount, 2); assert.equal(result.lastStateWasmBytes, 0);
});
test("CIM classification uses its real microsecond precision without confusing different native births", () => {
  assert.equal(wmiBirthKey({ pid: 18460, createdAt: "2026-10-18T23:57:09.7363723Z" }),
    wmiBirthKey({ pid: 18460, createdAt: "2026-10-18T23:57:09.7363720Z" }));
  const changed = structuredClone(report), identity = changed.nativeMemory.identities.find(row => row.pid === 18460);
  changed.nativeMemory.identities.push({ ...identity, createdAt: "2026-10-18T23:57:09.7363724Z" });
  assert.throws(() => attributeJspiRetention(changed), /Ambiguous PID reuse/);
});
test("missing measurements, corrupted process sums and mismatched process births cannot become zero or valid attribution", () => {
  for (const mutate of [
    value => { value.nativeMemory.phases.find(row => row.phase === "cleanup-1").last[3] = null; },
    value => { value.nativeMemory.phases.find(row => row.phase === "cleanup-2").last[7][0][1] += 1; },
    value => { const phase = value.nativeMemory.phases.find(row => row.phase === "cleanup-3"); phase.last[3] -= phase.last[7].at(-1)[1]; phase.last[7].pop(); },
  ]) { const changed = structuredClone(report); mutate(changed); assert.throws(() => attributeJspiRetention(changed)); }
});
