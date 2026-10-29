import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { analyzeRetainedSvgAllocation } from "../scripts/lib/svg-retained-allocation-analysis.mjs";
const load = async () => JSON.parse(await readFile("evidence/2026-10-29T21-07-53-775Z-source-svg-browser.json"));
test("captured median sample resolves renderer and GPU growth without changing a single primary byte or role guessing", async () => {
  const browser = await load(), before = JSON.stringify(browser), analysis = analyzeRetainedSvgAllocation(browser);
  assert.equal(JSON.stringify(browser), before); assert.equal(analysis.incrementalPrivateMiB, 265.4453125); assert.equal(analysis.passed, false);
  assert.equal(analysis.processCountOrTotalsChanged, false); assert.equal(analysis.formulaChanged, false);
  assert.deepEqual(analysis.processes.slice(0, 2).map(row => [row.pid, row.type, row.measuredGrowthBytes]),
    [[18084, "renderer", 190754816], [34552, "gpu-process", 76271616]]);
  const fresh = analysis.processes.find(row => row.pid === 39176);
  assert.equal(fresh.type, "unknown"); assert.equal(fresh.blankPrivateBytes, null); assert.equal(fresh.measuredGrowthBytes, null);
  assert.equal(fresh.knownBornAfterBaseline, true); assert.equal(fresh.missingBaselineValueReplacedWithZero, false);
  assert.equal(analysis.specificAllocationStacksProven, false); assert.equal(analysis.staleWorkerHeapFailureProvesProductionWorkerLeak, false);
  const stale = analysis.realmHeaps.find(row => row.targetId === "85454A7C2FCF63FA5D0A242F0A0706A4");
  assert.equal(stale.validHeapSamples, 1); assert.equal(stale.unavailableHeapSamples, 6);
});
test("retained analysis refuses unstable, missing, fabricated and inconsistent memory evidence", async () => {
  const browser = await load();
  for (const mutate of [value => { value.blankBaseline.stable = false; }, value => { value.baselineAdjusted = true; },
    value => { value.memory.unavailableSamples = 1; }, value => { value.blankSamples = []; },
    value => { value.memory.peak.processes[0].privateBytes++; }, value => { value.memory.incrementalPrivateMiB = 200; }]) {
    const bad = structuredClone(browser); mutate(bad); assert.throws(() => analyzeRetainedSvgAllocation(bad));
  }
});
