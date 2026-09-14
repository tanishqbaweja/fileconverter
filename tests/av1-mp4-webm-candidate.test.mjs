import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  conversionProfiles,
  publicProfilesFor,
} from "../lib/capability-registry.ts";

const evidenceName =
  "evidence/av1-mp4-webm-native-feasibility-2026-09-14.json";
const evidence = JSON.parse(readFileSync(evidenceName, "utf8"));
const browserEvidenceName =
  "evidence/av1-mp4-webm-browser-acceptance-2026-09-15.json";
const browserEvidence = JSON.parse(readFileSync(browserEvidenceName, "utf8"));

test("AV1 MP4 to WebM is public after exact published reproduction", () => {
  const profile = conversionProfiles.find(
    ({ id }) => id === "mp4-to-webm-av1",
  );
  assert.ok(profile);
  assert.equal(profile.input, "mp4");
  assert.equal(profile.output, "webm-av1");
  assert.equal(profile.route, "stream-copy");
  assert.equal(profile.public, true);
  assert.equal(profile.automatedTestStatus, "passed");
  assert.equal(profile.maxTestedBytes, 170_433_726);
  assert.equal(
    publicProfilesFor("mp4").some(({ id }) => id === profile.id),
    true,
  );
  assert.equal(
    publicProfilesFor("mp4", true).some(({ id }) => id === profile.id),
    true,
  );
});

test("production-browser acceptance covers both destination modes and rejected optimizations", () => {
  assert.equal(browserEvidence.profile.id, "mp4-to-webm-av1");
  assert.equal(
    browserEvidence.status,
    "accepted-current-public-profile",
  );
  assert.equal(browserEvidence.dockerUsed, false);
  assert.equal(browserEvidence.engineBuild.exactPublishedReproductionRun, 34899740113);
  assert.equal(
    browserEvidence.engineBuild.exactPublishedReproductionCommit,
    "0c8bc78f6242b87ae3ba73ddfd97d4621e4d97fe",
  );
  assert.equal(browserEvidence.engineBuild.exactPublishedReproductionResult, "success");
  assert.equal(browserEvidence.engineBuild.mismatchArtifactUploadSkipped, true);
  assert.equal(browserEvidence.engineBuild.retainedArtifacts, 0);
  assert.equal(browserEvidence.engineBuild.candidateArtifactDeleted, true);
  assert.equal(browserEvidence.smallProductionBrowserValidation.result, "3 passed");
  assert.equal(browserEvidence.stressValidation.passed, true);
  assert.equal(browserEvidence.stressValidation.destinationModes.length, 2);
  assert.deepEqual(
    browserEvidence.stressValidation.destinationModes.map(({ mode }) => mode),
    ["sync-opfs", "direct-handle"],
  );
  for (const destination of browserEvidence.stressValidation.destinationModes) {
    assert.equal(destination.passed, true);
    assert.equal(destination.elapsedMs.length, 3);
    assert.ok(destination.worstIncrementalPrivateMiB <= 250);
    assert.equal(destination.reportSha256.length, 64);
  }
  assert.equal(browserEvidence.stressValidation.maxReadChunkBytes, 256 * 1024);
  assert.equal(browserEvidence.stressValidation.maxWriteChunkBytes, 256 * 1024);
  assert.equal(browserEvidence.stressValidation.maxQueuedBytes, 256 * 1024);
  assert.equal(browserEvidence.stressValidation.maxPendingOperations, 1);
  assert.equal(browserEvidence.stressValidation.wasmMemoryBytes, 32 * 1024 * 1024);
  assert.equal(browserEvidence.optimizationAudit.rejected.length, 2);
  assert.equal(browserEvidence.cleanup.rawStressReportFilesRetained, 0);
  assert.equal(browserEvidence.cleanup.remoteCandidateArtifactsRetained, 0);
  assert.equal(
    browserEvidence.optimizationAudit.accepted.name,
    "direct-route reusable asynchronous BYOB input",
  );
});

test("native feasibility records the exact accepted and rejected timing cases", () => {
  assert.equal(evidence.candidateProfile, "mp4-to-webm-av1");
  assert.equal(
    evidence.candidateStatus,
    "accepted-current-public-profile",
  );
  const encoderOrigin = evidence.trials.find(
    ({ name }) => name === "encoder-origin-av1-opus-mp4-to-live-webm",
  );
  const inherited = evidence.trials.find(
    ({ name }) => name === "millisecond-quantized-cross-container-origin-mp4",
  );
  const mov = evidence.trials.find(
    ({ name }) => name === "av1-opus-mov-output",
  );
  assert.ok(encoderOrigin);
  assert.ok(inherited);
  assert.ok(mov);
  assert.equal(encoderOrigin.input.decodedVideoSha256, encoderOrigin.output.decodedVideoSha256);
  assert.equal(encoderOrigin.input.decodedAudioSha256, encoderOrigin.output.decodedAudioSha256);
  assert.equal(encoderOrigin.input.videoPacketSha256, encoderOrigin.output.videoPacketSha256);
  assert.equal(encoderOrigin.input.audioPacketSha256, encoderOrigin.output.audioPacketSha256);
  assert.equal(inherited.input.videoPacketSha256, inherited.stockOutput.videoPacketSha256);
  assert.equal(inherited.input.audioPacketSha256, inherited.stockOutput.audioPacketSha256);
  assert.equal(inherited.input.firstOpusPacketSkipSamples, 336);
  assert.equal(inherited.stockOutput.firstOpusPacketSkipSamples, 312);
  assert.equal(
    inherited.stockOutput.decodedAudioSamples - inherited.input.decodedAudioSamples,
    24,
  );
  assert.equal(mov.result, "intentionally-rejected-by-ffmpeg");
  assert.equal(mov.retainedOutputBytes, 0);
  assert.equal(evidence.cleanup.disposableConvertedCopiesRetained, 0);
});

test("candidate source keeps Opus priming and stress I/O bounded", () => {
  const wrapper = readFileSync("media/ffmpeg/within_remux.c", "utf8");
  const worker = readFileSync("workers/conversion.worker.ts", "utf8");
  const browser = readFileSync("tests/browser/media-remux.spec.ts", "utf8");
  const stress = readFileSync(
    "scripts/generate-compatible-webm-stress-fixture.mjs",
    "utf8",
  );
  const cleanup = readFileSync("scripts/cleanup-generated.mjs", "utf8");
  const reproduction = readFileSync(
    "media/ffmpeg/reproduce-nondocker.sh",
    "utf8",
  );
  const sourcePatch = readFileSync(
    "media/ffmpeg/patches/mp4-webm-opus-priming-source.patch",
  );
  assert.match(wrapper, /av1_webm_output && codec_id == AV_CODEC_ID_OPUS/);
  assert.match(wrapper, /prefetched_packet_count < 4096/);
  assert.match(wrapper, /2 \* 1024 \* 1024 - prefetched_bytes/);
  assert.match(worker, /mp4-to-webm-av1/);
  assert.match(browser, /expectCompressedVideoPacketMatch\(av1OpusMp4FixturePath/);
  assert.match(browser, /expectCompressedAudioPacketMatch\(av1OpusMp4FixturePath/);
  assert.match(browser, /expectDecodedPcmMatch\(av1OpusMp4FixturePath/);
  assert.match(stress, /compatible-vp9-opus-128m\.mp4/);
  assert.match(cleanup, /av1-isobmff-webm-feasibility/);
  assert.match(cleanup, /compatible-vp9-opus-128m\.mp4\.json/);
  assert.match(reproduction, /mp4-webm-opus-priming-source\.patch/);
  assert.equal(
    createHash("sha256").update(sourcePatch).digest("hex"),
    "c2f56a458552e3d0bac647c26de0042eebb62e6d2eb4054ac8574fed6b908da2",
  );
});
