import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { classifyAllocationProbeFailure } from "../images/resvg-source/allocation-probe.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-28-svg-allocation-probe-terminal.json"));
const raw = await Promise.all(terminal.receipts.map(async pin => {
  const bytes = await readFile(pin.path); assert.equal(bytes.length, pin.bytes); assert.equal(sha(bytes), pin.sha256);
  return JSON.parse(bytes);
}));
const [outer, inner] = raw;
test("actual native probe uniquely confirms the24MB failed allocation, never a successful conversion", () => {
  const failure = inner.stressRuns[0].result.metrics.svgRuntimeFailure;
  assert.deepEqual(failure.probe, {site:3,value:24000000});
  assert.equal(classifyAllocationProbeFailure(failure.probe, inner.instrumentation, failure.stack).kind, "payload-allocation-null");
  assert.equal(outer.probeClassifications[0].classification.attemptedAllocationBytes, 24000000);
  assert.ok(outer.probeClassifications.slice(1).every(row => row.classification === null));
  assert.deepEqual([inner.stats.expected, inner.stats.unexpected, inner.stats.skipped], [0,1,2]);
  assert.equal(inner.stressRuns[0].result.metrics.outputBytes, 0);
  assert.equal(inner.wasmMemory[0].maximumBytes, 100663296);
  assert.equal(terminal.memoryAcceptance, false); assert.equal(terminal.optimizationProven, false);
  assert.equal(terminal.wholeGoalComplete, false); assert.equal(terminal.portableRegressionObservation.passedClaim, false);
});
test("stable diagnostic baseline/math and all6 owned exits remain independently checkable, not acceptance", () => {
  assert.equal(inner.blankBaseline.stable, true); assert.equal(inner.baselineAdjusted, false);
  assert.equal(inner.browserServicesDisabledByDriver, false);
  assert.equal((inner.memory.peak.privateBytes-inner.blankBaseline.privateBytes)/1048576, terminal.observationsNotAcceptance.incrementalPrivateMiB);
  assert.equal(inner.memory.validSamples, 46); assert.equal(inner.memory.unavailableSamples, 0);
  assert.deepEqual(inner.protectedOriginalBefore, inner.protectedOriginalAfter);
  const exits = [...inner.processCleanup, outer.processCleanup, outer.fixture.cleanup];
  assert.equal(exits.length, 6); assert.ok(exits.every(row => row.status === "owned-identity-absent"));
  assert.equal(inner.ownedRuntimeRemoved, true); assert.equal(outer.ownedGenerationAndFixtureRuntimeRemoved, true);
  assert.equal(outer.fixture.ownedReferenceProfileRemoved, true); assert.deepEqual(outer.fixture.cleanupErrors, []);
});
