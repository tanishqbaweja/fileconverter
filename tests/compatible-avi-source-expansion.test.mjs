import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { conversionProfiles } from "../lib/capability-registry.ts";

const evidence = JSON.parse(
  readFileSync(
    "evidence/compatible-avi-source-expansion-2026-09-08.json",
    "utf8",
  ),
);
const currentMpegTsAvi = JSON.parse(
  readFileSync(
    "evidence/mpeg-ts-to-avi-current-chrome-optimization-2026-09-23.json",
    "utf8",
  ),
);
const currentMovAvi = JSON.parse(
  readFileSync(
    "evidence/mov-to-avi-current-chrome-optimization-2026-09-23.json",
    "utf8",
  ),
);
const app = readFileSync("app/converter/ConverterApp.tsx", "utf8");
const worker = readFileSync("workers/conversion.worker.ts", "utf8");
const nativeWrapper = readFileSync("media/ffmpeg/within_remux.c", "utf8");
const browser = readFileSync("tests/browser/media-remux.spec.ts", "utf8");
const generator = readFileSync(
  "scripts/generate-compatible-avi-stress-fixture.mjs",
  "utf8",
);
const profiler = readFileSync("scripts/memory-profile.mjs", "utf8");
const cleanup = readFileSync("scripts/cleanup-generated.mjs", "utf8");

const expectedBytes = {
  "mkv-to-avi": 191_735_971,
  "mp4-to-avi": 191_718_445,
  "mov-to-avi": 191_718_419,
  "3gp-to-avi": 177_146_977,
  "mpeg-ts-to-avi": 199_649_420,
};

test("compatible AVI source expansion has exact public stress evidence", () => {
  assert.equal(evidence.status, "accepted-public-expansion");
  assert.equal(evidence.dockerUsed, false);
  assert.deepEqual(
    Object.keys(evidence.profiles).sort(),
    Object.keys(expectedBytes).sort(),
  );
  for (const [id, bytes] of Object.entries(expectedBytes)) {
    const profile = conversionProfiles.find((candidate) => candidate.id === id);
    assert.ok(profile, id);
    assert.equal(profile.public, true, id);
    assert.equal(profile.automatedTestStatus, "passed", id);
    assert.equal(profile.route, "stream-copy", id);
    assert.ok(profile.maxTestedBytes >= bytes, id);
    assert.equal(evidence.profiles[id].sourceBytes, bytes, id);
    assert.equal(evidence.profiles[id].conversionSeconds.length, 3, id);
    assert.ok(evidence.profiles[id].worstIncrementalPrivateMiB <= 250, id);
  }
});

test("AVI browser and native paths retain every source route and bounded probe", () => {
  for (const id of Object.keys(expectedBytes)) {
    assert.match(worker, new RegExp(id.replaceAll("-", "-")));
    assert.match(browser, new RegExp(id.replaceAll("-", "-")));
  }
  assert.match(nativeWrapper, /container_avi_input_requires_probe/);
  assert.match(nativeWrapper, /probesize = 2 \* 1024 \* 1024/);
  assert.match(nativeWrapper, /max_analyze_duration = 2 \* AV_TIME_BASE/);
  assert.match(browser, /expectCompressedVideoPacketMatch/);
  assert.match(browser, /expectCompressedAudioPacketMatch/);
  assert.match(browser, /expectDecodedVideoMatch/);
  assert.match(browser, /to AVI propagates a bounded write failure/);
  assert.equal(evidence.smallBrowserGate.successCases, 4);
  assert.equal(evidence.smallBrowserGate.writeFailureCases, 4);
  assert.equal(evidence.smallBrowserGate.allPassed, true);
});

test("stress generation, validation, and cleanup remain fully wired", () => {
  assert.match(generator, /Promise\.allSettled/);
  assert.match(generator, /minimumFreeBytes = 2 \* 1024 \* 1024 \* 1024/);
  assert.match(profiler, /COMPATIBLE_AVI_PROFILES/);
  assert.match(profiler, /inspectAviOpenDml/);
  assert.match(profiler, /codec_name[\s\S]*-packet-sha256/);
  assert.match(cleanup, /avi-candidate-build/);
  assert.equal(evidence.stressGate.runsPerProfile, 3);
  assert.equal(evidence.stressGate.allPassed, true);
  assert.equal(evidence.stressGate.allPacketHashesExact, true);
  assert.equal(evidence.stressGate.allCancellationCleanupPassed, true);
  assert.equal(evidence.fixtureGeneration.seconds, 5.25);
  assert.equal(evidence.fixtureGeneration.allFilesRepositoryLocal, true);
  assert.equal(evidence.cleanup.rawReportsDeletedAfterCompaction, true);
  assert.equal(evidence.cleanup.largeFixturesDeletedAfterValidation, true);
  assert.equal(evidence.cleanup.downloadedCandidateDeletedAfterValidation, true);
  assert.equal(evidence.cleanup.candidateArtifactDeletedAfterPublication, true);
  assert.equal(evidence.publication.workflowRunId, 34_215_789_337);
  assert.equal(evidence.publication.result, "success");
  assert.equal(evidence.publication.allSixFfmpegModulesByteExact, true);
  assert.equal(evidence.publication.hostedCleanupPassed, true);
  assert.equal(evidence.publication.retainedArtifactCount, 0);
  assert.equal(evidence.publication.dockerUsed, false);
});

test("current Chrome MPEG-TS-to-AVI remains a genuine bounded packet copy with crash-safe staging", () => {
  const profile = conversionProfiles.find(({ id }) => id === "mpeg-ts-to-avi");
  assert.ok(profile?.public);
  assert.equal(profile.maxTestedBytes, currentMpegTsAvi.source.bytes);
  assert.equal(currentMpegTsAvi.status, "accepted");
  assert.equal(currentMpegTsAvi.output.sha256, evidence.profiles["mpeg-ts-to-avi"].outputSha256);
  assert.equal(currentMpegTsAvi.output.exactCompressedVideoAndAudioPackets, true);
  assert.equal(currentMpegTsAvi.output.fullNativeDecodePassed, true);
  assert.equal(currentMpegTsAvi.output.riffSegments, 24);
  assert.ok(currentMpegTsAvi.rejectedBaseline.incrementalPrivateMiB.some((value) => value > 250));
  assert.equal(currentMpegTsAvi.directSaveSessions.length, 3);
  assert.ok(currentMpegTsAvi.directSaveSessions.every(
    ({ elapsedMs, incrementalPrivateMiB }) =>
      elapsedMs.length === 3 &&
      incrementalPrivateMiB.length === 3 &&
      incrementalPrivateMiB.every((value) => value <= 250),
  ));
  assert.equal(currentMpegTsAvi.directSaveWorstIncrementalPrivateMiB, 248.328125);
  assert.equal(currentMpegTsAvi.acceptedTopology.maximumQueuedBytes, 262144);
  assert.equal(currentMpegTsAvi.acceptedTopology.maximumPendingOperations, 1);
  assert.match(app, /batch\.profile\.id !== "mpeg-ts-to-avi"/);
  assert.match(app, /async function removeAppOwnedOpfsEntry[\s\S]*attempt < 25[\s\S]*root\.removeEntry\(name\)/);
  assert.match(worker, /profileId !== "mpeg-ts-to-avi"/);
  assert.match(profiler, /"Copying staged AVI to selected destination"/);
  assert.match(browser, /to AVI worker crash removes staging and partial destination before restart/);
  assert.equal(currentMpegTsAvi.dockerUsed, false);
});

test("current Chrome MOV-to-AVI remains a genuine bounded packet copy with crash-safe staging", () => {
  const profile = conversionProfiles.find(({ id }) => id === "mov-to-avi");
  assert.ok(profile?.public);
  assert.equal(profile.maxTestedBytes, currentMovAvi.source.bytes);
  assert.equal(currentMovAvi.status, "accepted");
  assert.equal(currentMovAvi.output.sha256, evidence.profiles["mov-to-avi"].outputSha256);
  assert.equal(currentMovAvi.output.exactCompressedVideoAndAudioPackets, true);
  assert.equal(currentMovAvi.output.fullNativeDecodePassed, true);
  assert.equal(currentMovAvi.output.riffSegments, 24);
  assert.ok(currentMovAvi.rejectedBaseline.incrementalPrivateMiB.every((value) => value > 250));
  assert.equal(currentMovAvi.directSaveSessions.length, 3);
  assert.ok(currentMovAvi.directSaveSessions.every(
    ({ elapsedMs, incrementalPrivateMiB }) =>
      elapsedMs.length === 3 &&
      incrementalPrivateMiB.length === 3 &&
      incrementalPrivateMiB.every((value) => value <= 250),
  ));
  assert.equal(currentMovAvi.directSaveWorstIncrementalPrivateMiB, 244.19140625);
  assert.equal(currentMovAvi.acceptedTopology.maximumQueuedBytes, 262144);
  assert.equal(currentMovAvi.acceptedTopology.maximumPendingOperations, 1);
  assert.match(app, /batch\.profile\.id !== "mov-to-avi"/);
  assert.match(worker, /profileId !== "mov-to-avi"/);
  assert.match(profiler, /"Copying staged AVI to selected destination"/);
  assert.match(browser, /to AVI worker crash removes staging and partial destination before restart/);
  assert.equal(currentMovAvi.dockerUsed, false);
});
