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
