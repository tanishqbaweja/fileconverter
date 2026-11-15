import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertSameMkvNativeBuild } from "./mkv-protected-repeat-contract.mjs";
import { hevcKnownDtsWrapperSha256, hevcKnownDtsParserSha256 } from "../../media/ffmpeg/mkv-hevc-known-dts-candidate.mjs";
import { hevcMatroskaHeaderSha256 } from "../../media/ffmpeg/mkv-hevc-header-parser-candidate.mjs";

export const hevcHeaderLoopReference = Object.freeze({
  file: "evidence/2026-11-15T08-00-36-051Z-mkv-hevc-header-parser-loop-source-control.json",
  sha256: "93e71282cad5a7b57d8ba7e22b5991c459d187c47e421c84b4c6ea5b82e21ea4",
});
export function headerParserH264Regression(args) {
  if (args[3] === undefined) return null;
  assert.equal(args.length, 4); assert.equal(args[3], "--hevc-header-parser-core");
  const modes = { "--h264-startup-no-b-control": "h264-no-b-frames", "--h264-startup-bframes": "h264-bframes", "--h264-startup-positive": "h264-positive-start" };
  assert.ok(Object.hasOwn(modes, args[0]), "Header-core override requires an explicit existing H264 regression fixture");
  return modes[args[0]];
}
export function assertHevcHeaderParserCore(tools) {
  assert.equal(tools.head, "0e2f2caa924413a1edc81c23c49c027dd952fec8"); assert.equal(tools.runId, "43691831594");
  const b = tools.build, s = b.source;
  assert.equal(b.artifacts["within-direct.wasm"].sha256, "41c4a075de285d0d906b2711c5e5420a401235ab89e1f185abe5d48a830a3eba");
  assert.equal(b.artifacts["within_remux.c"].sha256, hevcKnownDtsWrapperSha256);
  assert.equal(b.artifacts["hevc-parser.c"].sha256, hevcKnownDtsParserSha256);
  assert.equal(b.artifacts["matroskadec.c"].sha256, hevcMatroskaHeaderSha256);
  assert.equal(s.hevcKnownDtsPreserved, true); assert.equal(s.hevcNominalDtsSynthesis, false);
  assert.equal(s.hevcHeaderParser.onlyHevcHeaderParsingPolicyChanged, true); assert.equal(s.hevcHeaderParser.decodedPicturesAdded, false);
  assert.deepEqual(s.library.enabledDecoders, ["h264"]);
  assert.equal(s.library.configSha256, "c30d169bd302ebaecb9de56b7352de1153375d4cfb6d8f79d43fe69440b8a6bc");
  assert.equal(s.inspectionBytes, 2097152); assert.equal(s.inspectionMicroseconds, 2000000);
  assert.equal(s.startupMaximumPayloadBytes, 2097152); assert.equal(s.startupMaximumInspectedPackets, 4096);
  assert.equal(s.startupMaximumVideoPackets, 33); assert.equal(s.startupMaximumReorderDepth, 16);
  assert.equal(s.knownPacketClocksRewritten, false); assert.equal(s.existingPtsAndKnownDtsUnchanged, true);
  assert.deepEqual(b.wasmMemory, [{ imported: true, initialPages: 384, maximumPages: 1024, shared: true }]);
  assert.equal(b.publicAcceptance, false);
}
export function readHevcHeaderLoopReference(bytes, tools) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), hevcHeaderLoopReference.sha256);
  const r = JSON.parse(bytes), [a] = r.arms;
  assert.equal(r.status, "passed-loop-source-fidelity-control-not-large-file-or-public-acceptance");
  assertHevcHeaderParserCore(tools); assertHevcHeaderParserCore(r.candidateBuild); assertSameMkvNativeBuild(r.candidateBuild, tools);
  assert.deepEqual(a.cases.map(c => c.state), ["complete", "cancelled", "error", "complete"]);
  for (const c of [a.cases[0], a.cases[3]]) {
    assert.ok(c.validation.completeDecodedVideoAndPcmEqual && c.validation.candidateGate.passed && c.outputRemoved);
    assert.equal(c.validation.video.maximumDtsDeltaUs, 0); assert.equal(c.validation.video.maximumPtsDeltaUs, 0);
  }
  assert.ok(a.memory.incrementalPrivateMiB <= 250 && a.memory.cleanupAboveIdleMiB !== null && a.memory.cleanupAboveIdleMiB <= 96);
  assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.fixtureRuntimeRemoved && r.toolDownloadRemoved);
  assert.deepEqual(r.originalBefore, r.originalAfter);
  return { ...hevcHeaderLoopReference, exactCurrentNativeBuildVerified: true, noConversionReplay: true };
}
