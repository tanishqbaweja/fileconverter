import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertHevcHeaderParserCore } from "./mkv-hevc-header-core-reference.mjs";
import { assertSameMkvNativeBuild } from "./mkv-protected-repeat-contract.mjs";
import { assertLargeScalingLosslessCoverage } from "./mkv-large-scaling-report.mjs";
import { mkvProtectedCopy } from "./mkv-protected-copy-contract.mjs";
import { MKV_SCALE_NEAR10GB, near10GbExpectedPcmSamples } from "./mkv-near10gb-scaling.mjs";

export const near10GbContentReference = Object.freeze({
  file: "evidence/2026-11-16T01-26-25-831Z-mkv-hevc-header-core-scale-near10gb.json",
  sha256: "1bbc256752f4bd3806fc1d9ff5a978f0b426b55ef4bf165e07478379212ecf4a",
});

// Authenticates prior content only. No transfer of memory, speed, production
// worker, disk writer, cleanup or release acceptance to the fresh run.
export function readNear10GbContentReference(bytes, tools) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), near10GbContentReference.sha256);
  const r = JSON.parse(bytes), [a] = r.arms, [c] = a.cases, v = c.validation;
  assert.equal(r.status, "passed-first-real-near10gb-scaling-not-repeats-or-public-acceptance");
  assertHevcHeaderParserCore(r.candidateBuild); assertSameMkvNativeBuild(r.candidateBuild, tools);
  assert.deepEqual(r.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 });
  assert.deepEqual(r.originalAfter, r.originalBefore);
  assert.ok(r.fixture.validMediaNotSparse && r.fixture.nativeToolUsedOnlyForFixtureGeneration);
  assert.equal(r.fixture.bytes, 9507509956); assert.equal(r.fixture.loops, MKV_SCALE_NEAR10GB.loops);
  assert.equal(r.fixture.sha256, "d137ddebdac4307f00c80e6887e7ae052fe74d8aecd29e074b23f50c8919a2b1");
  assert.equal(c.state, "complete"); assert.equal(c.metrics.outputBytes, 9512261399);
  assert.equal(v.outputSha256, "c63e89c25c3122adbe31f8362c7da3e56c2514bd84105ade918a0ac2e766b3f4");
  assert.equal(v.video.packets, MKV_SCALE_NEAR10GB.expectedVideoPackets);
  assert.equal(v.video.maximumPtsDeltaUs, 0); assert.equal(v.video.maximumDtsDeltaUs, 0); assert.equal(v.video.maximumIntervalErrorUs, 0);
  assert.equal(v.aac.packets, MKV_SCALE_NEAR10GB.expectedAudioPackets);
  const pcmSamples = near10GbExpectedPcmSamples(v.aac.packets, v.aac.initialSkipSamples, v.aac.trailingDiscardSamples);
  assert.ok(v.video.packetBytesIdentical && v.aac.packetBytesIdentical && v.fullDecode && v.candidateGate.passed);
  assert.deepEqual(v.codecConfiguration.source, v.codecConfiguration.output);
  assert.ok(v.completeDecodedVideoAndPcmEqual);
  for (const d of [v.sourceCompleteDecode, v.outputCompleteDecode]) {
    assert.equal(d.status, "passed-complete-independent-scaling-content-decode");
    assert.equal(d.decodedFrames, MKV_SCALE_NEAR10GB.expectedVideoPackets);
    assert.equal(d.decodedPcmBytes, pcmSamples * 2);
    assert.equal(d.duplicateFrames, 0); assert.equal(d.droppedFrames, 0);
    assert.equal(d.decodedFileCreated, false); assert.equal(d.fullMediaBufferCreated, false);
    assert.equal(d.nativeToolUsedForConversion, false);
  }
  assert.equal(v.sourceCompleteDecode.decodedVideoSha256, v.outputCompleteDecode.decodedVideoSha256);
  assert.equal(v.sourceCompleteDecode.decodedPcmSha256, v.outputCompleteDecode.decodedPcmSha256);
  assert.ok(c.outputRemoved && a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.fixtureRuntimeRemoved);
  assertLargeScalingLosslessCoverage(r);
  return { ...near10GbContentReference, sourceBytes: r.fixture.bytes, sourceSha256: r.fixture.sha256,
    outputBytes: c.metrics.outputBytes, outputSha256: v.outputSha256, decodedFrames: v.outputCompleteDecode.decodedFrames,
    sameExactNativeBuildRequired: true, noValidationReplay: true, repeatsAcceptance: false, publicAcceptance: false };
}
