import assert from "node:assert/strict";
export const SCREEN_ORDER = ["jspi", "lto", "lto", "jspi"];
export const SCREEN_MINIMUM_GAIN = 0.05;
export function median(values) {
  assert.ok(values.length > 0 && values.every(value => Number.isFinite(value) && value > 0));
  const sorted = values.toSorted((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
export function compareJspiLtoScreen(blocks) {
  assert.deepEqual(blocks.map(row => row.variant), SCREEN_ORDER);
  for (const block of blocks) {
    assert.equal(block.audit.complete, true); assert.equal(block.audit.originalValidatorsUnchanged, true);
    assert.equal(block.analysis.completedSmallOutputs, 6); assert.equal(block.analysis.completeAdverseRecoveryValidated, true);
    assert.equal(block.analysis.allSixOutputBytesAndPacketProofsIdenticalToQualifiedParent, true);
    assert.ok(block.analysis.peakIncrementalPrivateMiB <= 250);
    assert.equal(block.analysis.conversionUnavailableSamples, 0);
    assert.equal(block.analysis.elapsedMs.length, 6);
    assert.deepEqual(block.browserPinBefore, blocks[0].browserPinBefore);
    assert.deepEqual(block.browserPinAfter, blocks[0].browserPinBefore);
    assert.equal(block.validatorSha256, blocks[0].validatorSha256);
    assert.equal(block.fixtureSha256, blocks[0].fixtureSha256);
    assert.equal(block.analysis.outputSha256, blocks[0].analysis.outputSha256);
    assert.deepEqual(block.nativeSettings, blocks[0].nativeSettings);
    median(block.analysis.elapsedMs);
  }
  // Independent browser sessions are the experimental units, not 24 independent
  // samples. Compare the first three pre-fault jobs at identical lifecycle slots.
  const sessions = blocks.map((block, index) => ({ index, variant: block.variant,
    firstThreeMs: block.analysis.elapsedMs.slice(0, 3), medianMs: median(block.analysis.elapsedMs.slice(0, 3)),
    afterFaultRecoveryMs: block.analysis.elapsedMs.slice(3), peakIncrementalPrivateMiB: block.analysis.peakIncrementalPrivateMiB }));
  const pairs = [[0, 1], [3, 2]].map(([before, after]) => ({ baselineSession: before, candidateSession: after,
    baselineMedianMs: sessions[before].medianMs, candidateMedianMs: sessions[after].medianMs,
    reductionFraction: 1 - sessions[after].medianMs / sessions[before].medianMs,
    matchedPositionReductionFractions: sessions[before].firstThreeMs.map((value, index) => 1 - sessions[after].firstThreeMs[index] / value) }));
  const baselineMedianMs = median(sessions.filter(row => row.variant === "jspi").map(row => row.medianMs));
  const candidateMedianMs = median(sessions.filter(row => row.variant === "lto").map(row => row.medianMs));
  const reductionFraction = 1 - candidateMedianMs / baselineMedianMs;
  const screenPassed = reductionFraction >= SCREEN_MINIMUM_GAIN && pairs.every(pair => pair.reductionFraction >= SCREEN_MINIMUM_GAIN);
  return { status: screenPassed ? "small-fixture-lto-speed-screen-pass-requires-longer-workload" : "lto-not-accepted-as-speed-optimization",
    order: SCREEN_ORDER, sessions, pairs, baselineMedianMs, candidateMedianMs, reductionFraction,
    minimumReductionFraction: SCREEN_MINIMUM_GAIN, screenPassed, independentSessionCount: 4,
    timedPreFaultJobsPerVariant: 6, allValidatedOutputs: 24, allAdverseRecoveries: 12,
    allQualityMemoryPrivacyCleanupGatesPassed: true, confidenceInterval: null,
    scope: "Order-balanced clean-session 96-frame synthetic fixture screen only; two browser sessions per binary. Not a statistical/general/full-original speed guarantee.",
    smallFixtureSpeedGainObserved: screenPassed, generalSpeedGainProven: false, fullOriginalAcceptance: false,
    scalingAcceptance: false, publicAcceptance: false };
}
