import assert from "node:assert/strict";
import { test } from "node:test";
import { VP9_RECOVERY_PLAN, qualifyVp9Recovery } from "../scripts/lib/vp9-recovery-qualification.mjs";
test("bounded private recovery plan requires two actual adverse paths and three same-session validated completions", () => {
  assert.equal(VP9_RECOVERY_PLAN.length, 5); assert.equal(VP9_RECOVERY_PLAN.filter(row => row.fault === null).length, 3);
  assert.deepEqual(VP9_RECOVERY_PLAN.filter(row => row.fault).map(row => row.fault), ["cancel-after-write", "write"]);
  assert.ok(Object.isFrozen(VP9_RECOVERY_PLAN) && VP9_RECOVERY_PLAN.every(Object.isFrozen));
});
async function rejected({ peaks, result = {}, expected }) {
  const evidence = {}, calls = [], metadata = { type: "error", errorStage: "conversion", errorName: "AbortError", cleanupComplete: true,
    writeAttempts: 1, qualificationFaultTriggered: true, isolation: { childrenStarted: 2, terminationRequests: 2, candidateTerminationRequestedBeforeFallback: true },
    metrics: { peakPendingOperations: 1, peakQueuedBytes: 65536, maxReadChunkBytes: 65536, maxWriteChunkBytes: 65536 }, ...result };
  const page = { exposeBinding: async () => {}, mainFrame: () => ({}), evaluate: async (_callback, argument) => {
    if (typeof argument === "object") { calls.push("job"); return metadata; } calls.push("size-or-cleanup"); return 0;
  } };
  await assert.rejects(qualifyVp9Recovery({ page, evidence, observer: { setPhase: () => {}, through: async () => {}, peaks: () => peaks },
    blankBaseline: { stable: true, privateBytes: 100000000 }, loadedIdle: { privateBytes: 150000000 }, directory: "unused-unit-only",
  }), expected);
  assert.equal(evidence.passed, false); assert.equal(evidence.cases.length, 1); assert.equal(evidence.cases[0].opfsRemoved, true);
  assert.equal(evidence.cases[0].outputRemoved, true); assert.equal(evidence.publicAcceptance, false);
  assert.equal(calls.filter(value => value === "job").length, 1); return evidence;
}
test("missing process-tree samples remain null and abort qualification, while retaining cleanup and memory evidence", async () => {
  const evidence = await rejected({ peaks: { peak: null, validSamples: 0, unavailableSamples: 1 }, expected: /same-blank full-tree memory/ });
  assert.equal(evidence.memory.incrementalPrivateMiB, null); assert.equal(evidence.cases[0].memory.incrementalPrivateMiB, null);
});
test("an over-budget sample cannot pass by comparing against loaded idle rather than clean blank", async () => {
  const evidence = await rejected({ peaks: { peak: { privateBytes: 100000000 + 251 * 1048576 }, validSamples: 1, unavailableSamples: 0 },
    expected: /same-blank full-tree memory/ });
  assert.equal(evidence.memory.incrementalPrivateMiB, 251);
});
test("adverse-path intent is not evidence: the real write hook must report triggered and cleanup complete", async () => {
  const peaks = { peak: { privateBytes: 200000000 }, validSamples: 1, unavailableSamples: 0 };
  for (const result of [{ qualificationFaultTriggered: false }, { cleanupComplete: false }, { writeAttempts: 0 }])
    await rejected({ peaks, result, expected: /AssertionError/ });
});
