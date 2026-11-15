import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { complexMkvFixture } from "./mkv-complex-fidelity.mjs";
import { h264StartupWrapperSha256 } from "../../media/ffmpeg/mkv-h264-startup-candidate.mjs";
import { assertSameMkvNativeBuild, protectedRepeatReference, readProtectedRepeatReference } from "./mkv-protected-repeat-contract.mjs";
import { mkvProtectedCopy } from "./mkv-protected-copy-contract.mjs";

export const startupComplexReference = Object.freeze({ file: "evidence/2026-11-14T10-33-21-625Z-mkv-exact-aac-complex.json",
  sha256: "70120713e776e87bd33799ed1c55cef795cb5e6509e68a9e13841a3f09c5e170" });
export const startupSmallRegressions = Object.freeze([
  { file: "evidence/2026-11-14T23-59-14-309Z-mkv-startup-core-hevc-control.json", sha256: "9883ce62927cad1066a750c7928b50ca7ec889a0d22d210b918aa9e88008f2d0", kind: "hevc" },
  { file: "evidence/2026-11-15T00-00-35-705Z-mkv-startup-core-no-b-control.json", sha256: "4e921662842256e32b122cc09c641b5db2240c7c7b177246f3f358eb7017f1ea", kind: "h264-no-b-frames" },
]);
export const protectedCompleteVideoReference = Object.freeze({ file: "evidence/2026-11-14T09-24-11-075Z-mkv-exact-aac-protected-full-decode.json",
  sha256: "25b044e505807c7e3fa8a60db933d14e4819949228b22067f5540379f8985070" });

export function assertMkvStartupCore(tools) {
  assert.equal(tools.head, "147b05167d5d5729a8aa186c2c073c833816aa3c");
  assert.equal(tools.runId, "43653656481");
  const b = tools.build;
  assert.equal(b.source.candidateWrapperSha256, h264StartupWrapperSha256);
  assert.equal(b.artifacts["within-direct.wasm"].sha256, "62cf939ce720022ebf73e2f7dcf82fcdcfc33e7e4221334d691b992a2f4ae8ef");
  assert.equal(b.source.onlyMissingStartupDtsGenerated, true);
  assert.equal(b.source.existingPtsAndKnownDtsUnchanged, true);
  assert.equal(b.source.knownPacketClocksRewritten, false);
  assert.equal(b.source.hevcTimingPolicyUnchanged, true);
  assert.equal(b.source.startupMaximumPayloadBytes, 2097152);
  assert.equal(b.source.startupMaximumInspectedPackets, 4096);
  assert.deepEqual(b.source.library.enabledDecoders, ["h264"]);
  assert.equal(b.source.library.configSha256, "c30d169bd302ebaecb9de56b7352de1153375d4cfb6d8f79d43fe69440b8a6bc");
  assert.deepEqual(b.wasmMemory, [{ imported: true, initialPages: 384, maximumPages: 1024, shared: true }]);
  assert.equal(b.publicAcceptance, false);
}

export function readStartupSmallRegressions(buffers, tools) {
  assertMkvStartupCore(tools); assert.equal(buffers.length, startupSmallRegressions.length);
  return buffers.map((bytes, index) => {
    const ref = startupSmallRegressions[index];
    assert.equal(createHash("sha256").update(bytes).digest("hex"), ref.sha256);
    const r = JSON.parse(bytes), [a] = r.arms;
    assert.equal(r.startupCoreRegression, ref.kind);
    assert.equal(r.status, index ? "passed-complex-exact-aac-direct-reuse-not-public-acceptance" : "passed-probe-decoder-hevc-regression-not-public-acceptance");
    assertMkvStartupCore(r.candidateBuild); assertSameMkvNativeBuild(r.candidateBuild, tools);
    assert.deepEqual(a.cases.map(c => c.state), ["complete", "cancelled", "error", "complete"]);
    const first = a.cases[0], last = a.cases[3];
    for (const c of [first, last]) {
      assert.ok(c.validation.fullDecode && c.validation.candidateGate.passed && c.outputRemoved);
      assert.equal(c.validation.outputSha256, first.validation.outputSha256);
    }
    assert.ok(a.memory.incrementalPrivateMiB <= 250 && a.memory.cleanupAboveIdleMiB !== null && a.memory.cleanupAboveIdleMiB <= 96);
    assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.toolDownloadRemoved && r.fixtureRuntimeRemoved);
    if (a.browserCleanup.status !== "owned-observed-pids-absent") {
      assert.equal(a.birthCleanup.allObservedBirthsAbsent, true); assert.deepEqual(a.birthCleanup.unresolved, []);
      assert.equal(a.birthCleanup.observedPidCount, a.browserCleanup.observedPids.length);
    }
    return { ...ref, outputBytes: first.metrics.outputBytes, outputSha256: first.validation.outputSha256,
      incrementalPrivateMiB: a.memory.incrementalPrivateMiB, exactCurrentNativeBuildVerified: true };
  });
}

// The changed engine must produce EVERY byte of an independently validated old
// output. This is an output-identity reference, never native-build equivalence
// or a claim to perform another full native decode during the current run.
export function readStartupProtectedReference(packetBytes, videoBytes, tools) {
  assertMkvStartupCore(tools);
  const packetReport = JSON.parse(packetBytes);
  const packet = readProtectedRepeatReference(packetBytes, packetReport.candidateBuild);
  assert.equal(packetReport.candidateBuild.build.artifacts["within-direct.wasm"].sha256,
    "f56a8592f81294dc07190f400d9ce1399361ebfe963a558ff63bff4041707be7");
  const input = { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 };
  assert.deepEqual(packetReport.originalBefore, input);
  assert.equal(createHash("sha256").update(videoBytes).digest("hex"), protectedCompleteVideoReference.sha256);
  const videoReport = JSON.parse(videoBytes), [a] = videoReport.arms, [c] = a.cases, v = c.validation;
  assert.equal(videoReport.status, "passed-protected-complete-video-decode-not-public-acceptance");
  assert.deepEqual(videoReport.originalBefore, input); assert.deepEqual(videoReport.originalAfter, input);
  assert.equal(v.outputSha256, packet.outputSha256); assert.equal(c.metrics.outputBytes, packet.outputBytes);
  assert.equal(v.fullVideoDecode, true); assert.ok(v.candidateGate.passed);
  assert.equal(v.completeVideo.status, "passed-complete-independent-video-decode");
  assert.equal(v.completeVideo.decodedFrames, mkvProtectedCopy.videoPackets);
  assert.equal(v.completeVideo.finalOutputTimeSeconds, 12340);
  assert.equal(v.completeVideo.duplicateFrames, 0); assert.equal(v.completeVideo.droppedFrames, 0);
  assert.equal(v.completeVideo.nativeToolUsedForConversion, false);
  assert.ok(c.outputRemoved && a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && videoReport.toolDownloadRemoved);
  assert.equal(a.browserCleanup.status, "owned-observed-pids-absent");
  assert.equal(packet.outputBytes, 2962151594);
  assert.equal(packet.outputSha256, "247c77c371340f8bfb090dc8f8cfde22d83ca1e83483672847013527c50d937b");
  return { input, outputBytes: packet.outputBytes, outputSha256: packet.outputSha256,
    packetAndCompletePcmReference: protectedRepeatReference, completeVideoReference: protectedCompleteVideoReference,
    independentlyDecodedVideoFrames: v.completeVideo.decodedFrames, fullVideoDecodePerformedThisRun: false,
    nativeCoreEqualityClaimed: false, scope: "Whole output-byte equality to prior complete packet/PCM/video validators; changed authenticated candidate, not another native decode or same-core claim." };
}

export function readStartupComplexReference(bytes, fixture) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), startupComplexReference.sha256);
  const r = JSON.parse(bytes), [a] = r.arms;
  assert.equal(r.status, "passed-complex-exact-aac-direct-reuse-not-public-acceptance");
  assert.equal(r.candidateBuild.build.artifacts["within-direct.wasm"].sha256,
    "3d08c462c2075da150386de99b1408cfc72e0d2f21436c40153b95a6ff3148fc");
  assert.equal(fixture.bytes, complexMkvFixture.bytes); assert.equal(fixture.sha256, complexMkvFixture.sha256);
  assert.equal(r.fixture.bytes, fixture.bytes); assert.equal(r.fixture.sha256, fixture.sha256);
  assert.equal(r.fixture.sourceProbe.streams[0].has_b_frames, 0);
  assert.deepEqual(a.cases.map(c => c.state), ["complete", "cancelled", "error", "complete"]);
  const first = a.cases[0];
  for (const c of [first, a.cases[3]]) {
    assert.ok(c.validation.fullDecode && c.validation.candidateGate.passed && c.outputRemoved);
    assert.equal(c.validation.sourceDecodedHashes, c.validation.outputDecodedHashes);
    assert.equal(c.validation.packets.packetBytesIdentical, true);
    assert.deepEqual(c.validation.packets.aac.map(t => t.initialSkipSamples), [1024, 1024]);
    assert.equal(c.validation.outputSha256, first.validation.outputSha256);
  }
  assert.ok(a.memory.incrementalPrivateMiB <= 250 && a.memory.cleanupAboveIdleMiB !== null && a.memory.cleanupAboveIdleMiB <= 96);
  assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.toolDownloadRemoved && r.fixtureRuntimeRemoved);
  assert.equal(a.browserCleanup.status, "owned-observed-pids-absent");
  assert.deepEqual(r.originalBefore, r.originalAfter);
  return { ...startupComplexReference, input: complexMkvFixture, outputBytes: first.metrics.outputBytes,
    outputSha256: first.validation.outputSha256, nativeCoreEqualityClaimed: false,
    scope: "Same pinned no-B-frame input, complete output identity to independently validated probe-core result; deliberately a different engine under test." };
}
