import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { mergeLifecycleProviders, inspectLifecycleDiagnostic } from "../scripts/lib/lifecycle-allocation-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-17T04-35-52-913Z-lifecycle-warm-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path)));
test("merge split allocator providers by process without double counting or missing-value zero", () => {
  const rows = mergeLifecycleProviders([{ pid: 1, privateFootprintBytes: 100, allocators: {} },
    { pid: 1, privateFootprintBytes: null, allocators: { "v8/main/malloc": { size: 50 } } }]);
  assert.equal(rows.length, 1); assert.equal(rows[0].providerRows, 2);
  assert.equal(rows[0].privateFootprintBytes, 100); assert.equal(rows[0].allocators["v8/main/malloc"].size, 50);
  assert.throws(() => mergeLifecycleProviders([{ pid: 1, allocators: { v8: { size: 1 } } }, { pid: 1, allocators: { v8: { size: 2 } } }]));
});
test("actual idle snapshots show stable worker malloc but compositor/Skia changes; no invented peak cause", () => {
  const result = inspectLifecycleDiagnostic(terminal, report);
  assert.equal(result.points.length, 5); assert.deepEqual(result.points.map(row => row.workerV8MallocBytes), [61496, 61496, 61496, 61496, 61496]);
  assert.equal(result.points[3].rendererCompositorBytes, 7864320); assert.equal(result.points[4].rendererCompositorBytes, 17432576);
  assert.equal(result.points[3].gpuSkiaBytes, 498212); assert.equal(result.points[4].gpuSkiaBytes, 11621062);
  assert.equal(result.diagnosticPerturbsMemory, true); assert.equal(result.allocationCauseProven, false);
  assert.equal(result.completeRecoveryValidated, false); assert.equal(result.publicAcceptance, false);
});
