import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertHevcHeaderParserCore } from "./mkv-hevc-header-core-reference.mjs";
import { assertSameMkvNativeBuild } from "./mkv-protected-repeat-contract.mjs";
import { assertLargeScalingLosslessCoverage } from "./mkv-large-scaling-report.mjs";
import { mkvProtectedCopy } from "./mkv-protected-copy-contract.mjs";
export const near10GbReference = Object.freeze({
  file: "evidence/2026-11-16T01-26-25-831Z-mkv-hevc-header-core-scale-near10gb.json",
  sha256: "1bbc256752f4bd3806fc1d9ff5a978f0b426b55ef4bf165e07478379212ecf4a",
});
// Future repeats may inherit complete decoding ONLY after matching EVERY source
// and output byte and the SAME exact native core. Never a fresh decode claim.
export function readNear10GbReference(bytes, tools) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), near10GbReference.sha256);
  const r = JSON.parse(bytes), [a] = r.arms, [c] = a.cases, v = c.validation;
  assert.equal(r.status, "passed-first-real-near10gb-scaling-not-repeats-or-public-acceptance");
  assertHevcHeaderParserCore(tools); assertHevcHeaderParserCore(r.candidateBuild); assertSameMkvNativeBuild(r.candidateBuild, tools);
  assert.deepEqual(r.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 }); assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.equal(r.fixture.bytes, 9507509956); assert.equal(r.fixture.loops, 1600);
  assert.equal(r.fixture.sha256, "d137ddebdac4307f00c80e6887e7ae052fe74d8aecd29e074b23f50c8919a2b1");
  assert.equal(c.state, "complete"); assert.equal(c.metrics.outputBytes, 9512261399);
  assert.equal(v.outputSha256, "c63e89c25c3122adbe31f8362c7da3e56c2514bd84105ade918a0ac2e766b3f4");
  assert.equal(v.video.packets, 460800); assert.equal(v.video.comparableDts, 460798); assert.equal(v.aac.packets, 902400);
  for (const key of ["maximumPtsDeltaUs", "maximumDtsDeltaUs", "maximumIntervalErrorUs"]) assert.equal(v.video[key], 0);
  assert.ok(v.video.packetBytesIdentical && v.aac.packetBytesIdentical && v.completeEncodedStreamHashesEqual);
  assert.deepEqual(v.codecConfiguration.source, v.codecConfiguration.output); assert.ok(v.completeDecodedVideoAndPcmEqual && v.candidateGate.passed);
  for (const d of [v.sourceCompleteDecode, v.outputCompleteDecode]) {
    assert.equal(d.status, "passed-complete-independent-scaling-content-decode"); assert.equal(d.decodedFrames, 460800);
    assert.equal(d.decodedVideoBytes, 637009920000); assert.equal(d.decodedPcmBytes, 1848113152); assert.equal(d.expectedAudioSamples, 924056576);
    assert.equal(d.droppedFrames, 0); assert.equal(d.duplicateFrames, 0); assert.ok(d.elapsedMs <= d.deadlineMs && d.deadlineMs === 1800000);
    assert.ok(d.maximumDecodedReadChunkBytes <= 262144); assert.equal(d.maximumRetainedDecodedChunks, 1);
    assert.equal(d.decodedFileCreated, false); assert.equal(d.fullMediaBufferCreated, false); assert.equal(d.nativeToolUsedForConversion, false);
  }
  assert.equal(v.sourceCompleteDecode.decodedVideoSha256, v.outputCompleteDecode.decodedVideoSha256);
  assert.equal(v.sourceCompleteDecode.decodedPcmSha256, v.outputCompleteDecode.decodedPcmSha256);
  assert.equal(c.metrics.peakWasmMemoryBytes, 24 * 1048576); assert.ok(c.metrics.maxReadChunkBytes <= 262144);
  assert.ok(c.metrics.maxWriteChunkBytes <= 1048576 && c.metrics.peakQueuedBytes <= 1048576); assert.equal(c.metrics.peakPendingOperations, 1);
  assert.equal(c.metrics.queuedBytes, 0); assert.equal(c.metrics.pendingOperations, 0);
  assertLargeScalingLosslessCoverage(r); assert.ok(a.memory.incrementalPrivateMiB <= 250 && a.memory.cleanupAboveIdleMiB !== null && a.memory.cleanupAboveIdleMiB <= 96);
  assert.ok(c.outputRemoved && a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.fixtureRuntimeRemoved && r.toolDownloadRemoved);
  assert.equal(a.browserCleanup.status, "owned-observed-pids-absent"); assert.deepEqual(a.forbiddenRequests, []); assert.deepEqual(a.failures, []); assert.deepEqual(r.failures, []);
  for (const field of ["headed", "browserServicesDisabled", "productionFilesReplaced", "speedGainProven", "nativeConversionUsed", "publicAcceptance"]) assert.equal(r[field], false);
  return { ...near10GbReference, sourceBytes: r.fixture.bytes, sourceSha256: r.fixture.sha256, outputBytes: c.metrics.outputBytes, outputSha256: v.outputSha256,
    fullDecodedVideoFrames: 460800, sameExactNativeBuildRequired: true, noValidationReplay: true, repeatsAcceptance: false, publicAcceptance: false };
}
