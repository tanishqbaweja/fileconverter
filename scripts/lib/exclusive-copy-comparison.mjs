import assert from "node:assert/strict";
const median = rows => [...rows].sort((a, b) => a - b)[1];
export function inspectExclusiveCopyComparison(proof, native) {
  assert.equal(proof.status, "six-exact-large-copies-and-three-adverse-cases-passed-not-media-acceptance");
  assert.equal(proof.failure, null); assert.deepEqual(proof.cleanupErrors, []); assert.equal(proof.runtimeRemoved, true);
  assert.equal(proof.fixtureBytes, 6414309978); assert.equal(proof.generated.generatedBytes, proof.fixtureBytes);
  assert.equal(proof.generated.sparse, false); assert.equal(proof.generated.mediaConversion, false);
  assert.deepEqual(proof.forbiddenRequests, []); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  assert.equal(Object.keys(proof.sourcePins).length, 23); assert.equal(proof.primaryLimitMiB, 250);
  assert.ok(proof.diskFreeBytes >= 32 * 1024 ** 3); assert.equal(proof.host.safeToStart, true);
  assert.equal(proof.blankWindows.chosenLower, true); assert.equal(proof.blank.stable, true);
  assert.equal(proof.blank.privateBytes, Math.min(proof.blankWindows.early.privateBytes, proof.blankWindows.settled.privateBytes));
  assert.equal(native.intervalMs, 100); assert.equal(native.error, null);
  assert.equal(proof.runs.length, 6); const modes = ["convenience", "exclusive", "exclusive", "convenience", "convenience", "exclusive"];
  for (const [index, row] of proof.runs.entries()) {
    assert.equal(row.number, index + 1); assert.equal(row.mode, modes[index]);
    assert.equal(row.outputBytes, proof.fixtureBytes); assert.equal(row.outputSha256, proof.fixtureSha256);
    assert.ok(row.elapsedMs > 0); assert.equal(row.mediaConversion, false);
    assert.equal(row.metrics.outputBytes, proof.fixtureBytes); assert.equal(row.metrics.queuedBytes, 0); assert.equal(row.metrics.pendingOperations, 0);
    for (const field of ["peakQueuedBytes", "maxWriteChunkBytes", "maxScratchReadChunkBytes", "maxScratchWriteChunkBytes"]) assert.ok(row.metrics[field] <= 524288);
    assert.equal(row.metrics.peakPendingOperations, 1);
    assert.equal(row.quotaPlan.additionalBytesRequiredNow, proof.fixtureBytes); assert.equal(row.quotaPlan.fullPlannedPeakFileBytes, proof.fixtureBytes * 2);
    assert.ok(row.quotaPlan.reportedAvailableBytes >= proof.fixtureBytes);
    const phase = native.phases.find(p => p.phase === `copy-${index + 1}-${row.mode}`); assert.ok(phase);
    assert.equal(phase.peak[3], row.peakTreePrivateBytes); assert.equal(phase.validSamples, row.validSamples); assert.equal(phase.unavailableSamples, row.unavailableSamples);
    assert.equal(row.incrementalTreePrivateMiB, (phase.peak[3] - proof.blank.privateBytes) / 1048576); assert.ok(row.incrementalTreePrivateMiB <= 250);
    if (row.mode === "exclusive") {
      assert.equal(row.writer.locks, 1); assert.equal(row.writer.releases, 1); assert.equal(row.writer.writes, Math.ceil(proof.fixtureBytes / 524288));
      assert.equal(row.writer.retainedWriter, false); assert.equal(row.writer.retainedStream, false);
      assert.equal(row.writer.additionalCopyBufferBytes, 0); assert.equal(row.writer.queuedChunks, 0);
    } else assert.equal(row.writer, null);
  }
  assert.equal(proof.adverse.length, 3);
  for (const [index, name] of ["AbortError", "NotAllowedError", "QuotaExceededError"].entries()) {
    assert.equal(proof.adverse[index].error.name, name); assert.equal(proof.adverse[index].cleanup.outputRemoved, true);
  }
  const baseline = proof.runs.filter(row => row.mode === "convenience"), candidate = proof.runs.filter(row => row.mode === "exclusive");
  const pairs = [[baseline[0], candidate[0]], [baseline[1], candidate[1]], [baseline[2], candidate[2]]].map(([a, b]) => ({
    baselineRun: a.number, candidateRun: b.number, candidateMinusBaselineMs: b.elapsedMs - a.elapsedMs,
    candidateMinusBaselinePrivateMiB: b.incrementalTreePrivateMiB - a.incrementalTreePrivateMiB }));
  assert.ok(pairs.some(p => p.candidateMinusBaselineMs > 0) && pairs.some(p => p.candidateMinusBaselineMs < 0));
  assert.ok(pairs.some(p => p.candidateMinusBaselinePrivateMiB > 0) && pairs.some(p => p.candidateMinusBaselinePrivateMiB < 0));
  const baselineMedianMs = median(baseline.map(r => r.elapsedMs)), candidateMedianMs = median(candidate.map(r => r.elapsedMs));
  return { status: "exclusive-writer-correct-but-no-consistent-speed-or-memory-improvement-rejected-for-full-retry",
    fixtureBytes: proof.fixtureBytes, identicalValidatedCopies: 6, adverseCasesPassed: 3, fixtureSha256: proof.fixtureSha256,
    baselineMedianMs, candidateMedianMs, candidateMedianChangePercent: (candidateMedianMs / baselineMedianMs - 1) * 100,
    baselinePeakPrivateMiB: Math.max(...baseline.map(r => r.incrementalTreePrivateMiB)),
    candidatePeakPrivateMiB: Math.max(...candidate.map(r => r.incrementalTreePrivateMiB)), pairs,
    sameSessionMemoryDriftObserved: true, sourceCount: 23, actualBrowserCopies: true, actualMediaConversion: false,
    isolatedIoEvidenceNotFullMediaAcceptance: true, fullOriginalAcceptance: false, primaryMediaMemoryAcceptance: false,
    publicAcceptance: false, speedGainProven: false, lowerCopyMemoryProven: false, productionChangeRetained: false,
    nativeCodecAndPublicProductionSourcesChanged: false, unchangedFullRetryJustified: false };
}
