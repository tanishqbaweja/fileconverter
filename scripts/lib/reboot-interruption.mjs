import assert from "node:assert/strict";

// A durable partial observation is not a completed conversion or a memory pass.
export function inspectRebootInterruption(checkpoint, bootUtc, identities) {
  const boot = Date.parse(bootUtc), through = Date.parse(checkpoint.updatedAt);
  assert.ok(Number.isFinite(boot) && Number.isFinite(through) && boot > through);
  assert.equal(checkpoint.status, "observer-live-not-terminal-acceptance");
  assert.equal(checkpoint.conversionAcceptance, false);
  assert.equal(checkpoint.completeRunCoverageProven, false);
  assert.equal(checkpoint.baseline.stable, true);
  assert.ok(identities.length > 0);
  for (const identity of identities) {
    assert.ok(Number.isInteger(identity.pid) && identity.pid > 0);
    const born = Date.parse(identity.createdAt);
    assert.ok(Number.isFinite(born) && born < through && born < boot);
  }
  const conversions = checkpoint.native.phases.filter(row => /^conversion-\d+$/.test(row.phase));
  assert.ok(conversions.length > 0);
  const peak = Math.max(...conversions.map(row => row.peak[3]));
  assert.ok(Number.isSafeInteger(peak) && peak >= checkpoint.baseline.privateBytes);
  return {
    status: "interrupted-before-recorded-reboot-not-accepted",
    lastDurableObservation: checkpoint.updatedAt, observedBootUtc: bootUtc,
    exactTerminationTimeAndCause: null,
    recordedPrebootIdentitiesCannotSurviveBoot: identities.length,
    partialObservedIncrementalPrivateMiB: (peak - checkpoint.baseline.privateBytes) / 1048576,
    validConversionSamples: conversions.reduce((sum, row) => sum + row.validSamples, 0),
    unavailableConversionSamples: conversions.reduce((sum, row) => sum + row.unavailableSamples, 0),
    completeCoverage: false, completedValidatedRuns: 0,
    completeChromiumMemoryAcceptance: false, publicAcceptance: false,
  };
}
