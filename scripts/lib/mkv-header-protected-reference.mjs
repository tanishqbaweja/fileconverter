import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertHevcHeaderParserCore } from "./mkv-hevc-header-core-reference.mjs";
import { assertSameMkvNativeBuild } from "./mkv-protected-repeat-contract.mjs";
import { protectedCompleteVideoReference } from "./mkv-startup-core-reference.mjs";
import { mkvProtectedCopy } from "./mkv-protected-copy-contract.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
export const headerCoreH264References = Object.freeze([
  { file: "evidence/2026-11-15T08-13-54-689Z-mkv-hevc-header-core-h264-no-b-frames.json", sha256: "56fb5a91a42b5fa0c9727560aa65980184b49aad76e5f4db28d6d8b1ac1df32a", kind: "h264-no-b-frames", outputBytes: 782689, outputSha256: "cb62dd3f503c942cffd8ffc2547c29a68e6010a3338f45da24d76f9da395847b" },
  { file: "evidence/2026-11-15T08-18-29-063Z-mkv-hevc-header-core-h264-bframes.json", sha256: "832b43fdf79eda64d834caa701e0b2bd4212554856f02bdea4baeed82080344c", kind: "h264-bframes", outputBytes: 767355, outputSha256: "5958e362932a277ceba09d4734c3428dd8d5f8759b51e30fb18dde6723c70a0e" },
  { file: "evidence/2026-11-15T08-19-49-316Z-mkv-hevc-header-core-h264-positive-start.json", sha256: "c332b5a896b94d4553c7dc53f961f994b1f9f8d4c16b292bbb6dbb5a7ef407fa", kind: "h264-positive-start", outputBytes: 767391, outputSha256: "e63d72546361c88aa7746265439d425fe834c562794f5d9ce7c1557d227934cf" },
]);
export function readHeaderCoreH264Regressions(buffers, tools) {
  assertHevcHeaderParserCore(tools); assert.equal(buffers.length, headerCoreH264References.length);
  return buffers.map((bytes, index) => {
    const ref = headerCoreH264References[index]; assert.equal(sha(bytes), ref.sha256);
    const r = JSON.parse(bytes), [a] = r.arms;
    assert.equal(r.hevcHeaderParserRegression, ref.kind); assert.ok(r.status.startsWith("passed-"));
    assertHevcHeaderParserCore(r.candidateBuild); assertSameMkvNativeBuild(r.candidateBuild, tools);
    assert.deepEqual(a.cases.map(c => c.state), ["complete", "cancelled", "error", "complete"]);
    for (const c of [a.cases[0], a.cases[3]]) {
      assert.equal(c.metrics.outputBytes, ref.outputBytes); assert.equal(c.validation.outputSha256, ref.outputSha256);
      assert.ok(c.validation.fullDecode && c.validation.candidateGate.passed && c.outputRemoved);
      assert.ok(c.validation.packets.packetBytesIdentical);
    }
    assert.ok(a.memory.incrementalPrivateMiB <= 250 && a.memory.cleanupAboveIdleMiB !== null && a.memory.cleanupAboveIdleMiB <= 96);
    assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.fixtureRuntimeRemoved && r.toolDownloadRemoved);
    assert.deepEqual(r.originalBefore, r.originalAfter);
    return { ...ref, exactCurrentNativeBuildVerified: true, noConversionReplay: true };
  });
}

// Different native core deliberately under test. This reference can justify
// inherited full-video decoding ONLY if the new output matches EVERY byte.
// New container bytes require a new independent complete decode instead.
export function readPriorCompleteProtectedVideo(bytes) {
  assert.equal(sha(bytes), protectedCompleteVideoReference.sha256);
  const r = JSON.parse(bytes), [a] = r.arms, [c] = a.cases;
  assert.equal(r.status, "passed-protected-complete-video-decode-not-public-acceptance");
  assert.deepEqual(r.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 });
  assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.ok(c.validation.fullVideoDecode && c.validation.candidateGate.passed);
  const full = c.validation.completeVideo;
  assert.equal(full.status, "passed-complete-independent-video-decode"); assert.equal(full.decodedFrames, 296160);
  assert.equal(full.finalOutputTimeSeconds, 12340); assert.equal(full.duplicateFrames, 0); assert.equal(full.droppedFrames, 0);
  assert.equal(full.nativeToolUsedForConversion, false); assert.ok(c.outputRemoved && a.ownedRuntimeRemoved && r.toolDownloadRemoved);
  return { ...protectedCompleteVideoReference, outputBytes: c.metrics.outputBytes, outputSha256: c.validation.outputSha256,
    fullDecodedVideoFrames: full.decodedFrames, nativeBuildEqualityClaimed: false,
    scope: "prior complete video decode; inheritable only through exact complete output byte identity" };
}

export function canInheritCompleteProtectedVideo(prior, outputBytes, outputSha256) {
  assert.ok(Number.isSafeInteger(outputBytes) && outputBytes > 0); assert.match(outputSha256, /^[a-f0-9]{64}$/);
  return outputBytes === prior.outputBytes && outputSha256 === prior.outputSha256;
}
