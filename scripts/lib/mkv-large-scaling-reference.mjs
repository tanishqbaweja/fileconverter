import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertHevcHeaderParserCore } from "./mkv-hevc-header-core-reference.mjs";
import { assertSameMkvNativeBuild } from "./mkv-protected-repeat-contract.mjs";
import { assertLargeScalingLosslessCoverage } from "./mkv-large-scaling-report.mjs";
import { mkvProtectedCopy } from "./mkv-protected-copy-contract.mjs";
export const largeScalingReference = Object.freeze({
  file: "evidence/2026-11-15T23-19-43-422Z-mkv-hevc-header-core-scale-5gb.json",
  sha256: "81ae205ad1f3455983c8d78863642a92565f10ff3483cbd8b9e6efc8f82ef9c2",
});

// For FUTURE repeats only: authenticate the complete first proof, not a new
// conversion or fresh decode. Each repeat must still hash EVERY actual byte.
export function readLargeScalingReference(bytes, tools) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), largeScalingReference.sha256);
  const r = JSON.parse(bytes), [a] = r.arms, [c] = a.cases, v = c.validation;
  assert.equal(r.status, "passed-first-real-5gb-scaling-not-repeats-or-public-acceptance");
  assertHevcHeaderParserCore(tools); assertHevcHeaderParserCore(r.candidateBuild); assertSameMkvNativeBuild(r.candidateBuild, tools);
  assert.deepEqual(r.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 });
  assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.equal(r.fixture.bytes, 5347972392); assert.equal(r.fixture.loops, 900);
  assert.equal(r.fixture.sha256, "5583bb8ed097334b08952765ef915c3e8062dd1290c561d4d62e58571389b9a7");
  assert.ok(r.fixture.validMediaNotSparse && r.fixture.nativeToolUsedOnlyForFixtureGeneration);
  assert.equal(c.state, "complete"); assert.equal(c.metrics.outputBytes, 5350648699);
  assert.equal(v.outputSha256, "bc0d3bac6d8a18b9589b74bdb1bc7c035e1c7b4ee25d40c260360e1b5a38a835");
  assert.equal(v.video.packets, 259200); assert.equal(v.video.maximumPtsDeltaUs, 0); assert.equal(v.video.maximumDtsDeltaUs, 0);
  assert.equal(v.video.maximumIntervalErrorUs, 0); assert.equal(v.video.packetBytesIdentical, true);
  assert.equal(v.aac.packets, 507600); assert.equal(v.aac.initialSkipSamples, 1024); assert.equal(v.aac.packetBytesIdentical, true);
  assert.deepEqual(v.codecConfiguration.source, v.codecConfiguration.output);
  assert.ok(v.completeDecodedVideoAndPcmEqual && v.candidateGate.passed);
  for (const d of [v.sourceCompleteDecode, v.outputCompleteDecode]) {
    assert.equal(d.status, "passed-complete-independent-scaling-content-decode"); assert.equal(d.decodedFrames, 259200);
    assert.equal(d.duplicateFrames, 0); assert.equal(d.droppedFrames, 0); assert.equal(d.decodedFileCreated, false);
    assert.equal(d.nativeToolUsedForConversion, false);
  }
  assert.equal(v.sourceCompleteDecode.decodedVideoSha256, v.outputCompleteDecode.decodedVideoSha256);
  assert.equal(v.sourceCompleteDecode.decodedPcmSha256, v.outputCompleteDecode.decodedPcmSha256);
  assertLargeScalingLosslessCoverage(r);
  assert.ok(a.memory.incrementalPrivateMiB <= 250 && a.memory.cleanupAboveIdleMiB !== null && a.memory.cleanupAboveIdleMiB <= 96);
  assert.ok(c.outputRemoved && a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.fixtureRuntimeRemoved && r.toolDownloadRemoved);
  assert.equal(a.browserCleanup.status, "owned-observed-pids-absent");
  return { ...largeScalingReference, sourceBytes: r.fixture.bytes, sourceSha256: r.fixture.sha256,
    outputBytes: c.metrics.outputBytes, outputSha256: v.outputSha256, decodedFrames: 259200,
    sameExactNativeBuildRequired: true, noValidationReplay: true, repeatsAcceptance: false, publicAcceptance: false };
}
