import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
const root = new URL("../", import.meta.url), sha = bytes => createHash("sha256").update(bytes).digest("hex");
for (const [stamp, outputs] of [["2026-10-23T15-46-35.345Z", 0], ["2026-10-23T15-52-18.420Z", 1]]) {
  test(`actual rejected controls attempt ${stamp} is lossless, source-bound and not accepted`, async () => {
    const receipt = JSON.parse(await readFile(new URL(`evidence/${stamp}-mpeg2-controls-result.json`, root)));
    const archive = await readFile(new URL(receipt.archive.path, root));
    assert.equal(archive.length, receipt.archive.bytes); assert.equal(sha(archive), receipt.archive.sha256);
    const bytes = gunzipSync(archive, { maxOutputLength: 4 * 1048576 });
    assert.equal(bytes.length, receipt.archive.restoredBytes); assert.equal(sha(bytes), receipt.archive.restoredSha256);
    const raw = JSON.parse(bytes);
    assert.equal(receipt.status, "failed"); assert.equal(raw.status, "failed"); assert.equal(receipt.completed, false);
    assert.equal(receipt.completedCases.length, outputs); assert.equal(raw.controlsQualification.cases.length, outputs);
    assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.memory, null); assert.ok(receipt.failures.length > 0);
    assert.deepEqual(receipt.failures, raw.failures); assert.deepEqual(receipt.native, raw.native);
    assert.equal(receipt.sourcePins, Object.keys(raw.sources).length); assert.equal(receipt.recordedSourcesMatchHistoricalGitHead, true);
    assert.equal(receipt.protectedOriginalUnchangedAtExecution, true); assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true);
    assert.ok(receipt.independentCleanup.every(entry => entry.status === "owned-identity-absent"));
    if (outputs) {
      assert.equal(receipt.completedCases[0].output.frames, 96); assert.ok(receipt.completedCases[0].output.ssim >= 0.98);
      assert.equal(receipt.completedCases[0].output.sha256, "5bb6592e59cca09e455183576de58b267a203af69abca529b1705913d8f1cb46");
      assert.match(receipt.lastTerminal.message, /File too large/);
      assert.deepEqual(receipt.lastTerminal.metrics.mpeg2EncoderSettings, { width: 320, height: 180, frameRateNumerator: 15,
        frameRateDenominator: 1, bitRateBps: 1000000, qmin: 2, qmax: 12 });
    }
  });
}
test("repaired native controls produce two real validated files but retain the whole-tree memory failure", async () => {
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-24T01-38-25.488Z-mpeg2-controls-result.json", root)));
  const compressed = await readFile(new URL(receipt.archive.path, root));
  assert.equal(sha(compressed), receipt.archive.sha256); assert.equal(compressed.length, receipt.archive.bytes);
  const bytes = gunzipSync(compressed, { maxOutputLength: 4 * 1048576 });
  assert.equal(bytes.length, receipt.archive.restoredBytes); assert.equal(sha(bytes), receipt.archive.restoredSha256);
  const raw = JSON.parse(bytes);
  assert.equal(receipt.status, "failed"); assert.equal(receipt.completed, true); assert.equal(receipt.overallGatePassed, false);
  assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.completedCases.length, 2);
  assert.deepEqual(receipt.completedCases.map(c => c.output.frames), [96, 60]);
  assert.equal(receipt.completedCases[0].output.sha256, "5bb6592e59cca09e455183576de58b267a203af69abca529b1705913d8f1cb46");
  assert.equal(receipt.completedCases[1].output.sha256, "945e6f7705e180e31e0ca28f519ac96dbff2a352dd04c7f86aa3677e88025375");
  assert.equal(receipt.completedCases[1].output.bytes, 333527); assert.equal(receipt.completedCases[1].output.ssim, 0.995891);
  assert.equal(receipt.completedCases[1].output.copiedAudioPacketHash, receipt.completedCases[0].output.copiedAudioPacketHash);
  for (const c of receipt.completedCases) {
    assert.equal(c.output.fullNativeDecodePassed, true); assert.ok(c.output.videoClocks.maximumVideoPtsErrorSeconds < 0.001);
    assert.equal(c.output.titlePreserved, true); assert.equal(c.output.languagePreserved, true);
  }
  const samples = raw.diagnosticMemorySamples; assert.equal(samples.length, 410);
  assert.equal(raw.memory.unavailableSamples.length, 0);
  for (const sample of samples) assert.equal(sample.privateBytes, sample.processes.reduce((n, p) => n + p.privateBytes, 0));
  const peak = samples.filter(s => s.phase !== "blank").reduce((a, b) => a.privateBytes > b.privateBytes ? a : b);
  assert.equal((peak.privateBytes - raw.blankBaseline.privateBytes) / 1048576, 274.25390625);
  assert.equal(receipt.memory.incrementalPrivateMiB, 274.25390625); assert.ok(receipt.memory.incrementalPrivateMiB > 250);
  assert.match(receipt.failures[0], /incrementalPrivateMiB <= 250/);
  assert.equal(receipt.cleanup.allOwnedProcessesAbsent, true); assert.equal(receipt.protectedOriginalUnchangedAtExecution, true);
  const nativeBytes = await readFile(new URL(receipt.scaledPropertiesBuild.path, root));
  assert.equal(sha(nativeBytes), receipt.scaledPropertiesBuild.sha256);
  const build = JSON.parse(nativeBytes), actual = build.manifest.scaledProperties.actualWasm32;
  assert.equal(build.run.conclusion, "success"); assert.equal(build.run.databaseId, 40050006861);
  assert.equal(actual.oldWireResult, actual.expectedWireResult); assert.equal(actual.errorSymbol, "EFBIG");
  assert.equal(actual.correctedCopies, 1000); assert.equal(actual.maximumCorrectedSideData, 1); assert.equal(actual.mediaConversions, 0);
  assert.equal(receipt.scaledPropertiesBuild.buildSourceCount, 142); assert.equal(receipt.scaledPropertiesBuild.encoderUnchanged, true);
});
test("events-only diagnostic preserves the full-capture failure and does not pretend to be an identical-input speed A/B", async () => {
  const comparison = JSON.parse(await readFile(new URL("evidence/2026-10-24-mpeg2-controls-observer-comparison.json", root)));
  const receipts = [], raw = [];
  for (const variant of [comparison.fullCapture, comparison.eventsOnly]) {
    const receipt = JSON.parse(await readFile(new URL(variant.receipt, root))), archive = await readFile(new URL(receipt.archive.path, root));
    assert.equal(sha(archive), receipt.archive.sha256);
    const bytes = gunzipSync(archive, { maxOutputLength: 4 * 1048576 }); assert.equal(sha(bytes), receipt.archive.restoredSha256);
    const r = JSON.parse(bytes); receipts.push(receipt); raw.push(r);
    assert.equal(receipt.memory.incrementalPrivateMiB, variant.incrementalPrivateMiB); assert.equal(r.status, variant.status);
    assert.equal(r.observer.screenshots, variant.screenshots); assert.equal(r.observer.snapshots, variant.snapshots);
    assert.equal(r.diagnosticMemorySamples.length, variant.samples); assert.equal(r.memory.unavailableSamples.length, 0);
    for (const s of r.diagnosticMemorySamples) assert.equal(s.privateBytes, s.processes.reduce((n, p) => n + p.privateBytes, 0));
    assert.equal(r.protectedOriginalUnchanged, true); assert.equal(r.cleanup.allOwnedProcessesAbsent, true);
  }
  assert.deepEqual(raw[0].sources, raw[1].sources); assert.deepEqual(raw[0].native, raw[1].native); assert.deepEqual(raw[0].browser, raw[1].browser);
  const cases = raw.map(r => r.controlsQualification.cases);
  assert.deepEqual(cases[0].map(c => c.output.sha256), cases[1].map(c => c.output.sha256));
  assert.deepEqual(cases[0].map(c => c.actualNativeSettings), cases[1].map(c => c.actualNativeSettings));
  assert.deepEqual(raw.map(r => r.fixture.sha256), comparison.inputFileHashes); assert.notEqual(...comparison.inputFileHashes);
  assert.equal(comparison.identicalInputFileBytes, false); assert.equal(comparison.globalSpeedClaim, false);
  assert.equal(comparison.fullCaptureMemoryFailureStillOpen, true); assert.equal(comparison.publicAcceptance, false);
  assert.equal(receipts[1].diagnosticObserverOnly, true); assert.equal(receipts[1].overallGatePassed, true); assert.equal(receipts[1].publicAcceptance, false);
  const allocation = receipts[1].postMeasurementAllocationArchive, packed = await readFile(new URL(allocation.path, root));
  assert.equal(sha(packed), allocation.sha256); assert.equal(packed.length, allocation.bytes);
  const restored = gunzipSync(packed, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(restored), allocation.restoredSha256);
  assert.equal(restored.length, allocation.restoredBytes);
  assert.equal(receipts[1].postMeasurementAllocationScope.acceptanceMetric, false);
  assert.equal(receipts[1].postMeasurementAllocationScope.allocationStackAttribution, false);
});
test("first bounded run retains genuine content/memory results but not off-screen visual coverage", async () => {
  const review = JSON.parse(await readFile(new URL("evidence/2026-10-24-mpeg2-bounded-visual-initial-review.json", root)));
  const receipt = JSON.parse(await readFile(new URL(review.receipt, root))), packed = await readFile(new URL(receipt.archive.path, root));
  assert.equal(sha(packed), receipt.archive.sha256);
  const bytes = gunzipSync(packed, { maxOutputLength: 4 * 1048576 }); assert.equal(sha(bytes), receipt.archive.restoredSha256);
  const raw = JSON.parse(bytes), visuals = receipt.boundedVisualObservation;
  assert.equal(receipt.memory.incrementalPrivateMiB, 239.15625); assert.equal(raw.diagnosticMemorySamples.length, 356);
  assert.equal(raw.memory.unavailableSamples.length, 0); assert.equal(receipt.completedCases.length, 2);
  assert.equal(receipt.fixture.sha256, "e70b76ca98594c4626024a68ad7886e3a9751e4fa1c9e124b616a7ff67e6b740");
  assert.equal(visuals.captures.length, 5); assert.equal(visuals.totalBytes, 908659);
  for (const capture of visuals.captures) { const picture = await readFile(new URL(capture.file, root)); assert.equal(sha(picture), capture.sha256); assert.equal(picture.length, capture.bytes); }
  assert.equal(visuals.captures.filter(c => c.nativeStateAroundScreenshot).length, 2);
  assert.equal(receipt.boundedVisibleProgressVerified, false); assert.equal(review.visibleProgressVerified, false);
  assert.equal(review.fullVisualEquivalenceVerified, false); assert.equal(review.headedCoverage, false); assert.equal(review.publicAcceptance, false);
});
