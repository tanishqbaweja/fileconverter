import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { conversionProfiles } from "../lib/capability-registry.ts";

const projectRoot = path.resolve(import.meta.dirname, "..");
const evidenceName = "compatible-avi-copy-2026-09-08.json";
const evidence = JSON.parse(
  await readFile(path.join(projectRoot, "evidence", evidenceName), "utf8"),
);
const mpeg2EvidenceName = "compatible-avi-mpeg2-2026-09-08.json";
const mpeg2Evidence = JSON.parse(
  await readFile(path.join(projectRoot, "evidence", mpeg2EvidenceName), "utf8"),
);

test("compatible AVI evidence matches the current public profile", () => {
  assert.deepEqual(evidence.requirements, ["P-08", "M-04"]);
  assert.equal(evidence.dockerUsed, false);
  const profile = conversionProfiles.find(
    ({ id }) => id === evidence.profile.id,
  );
  assert.ok(profile);
  assert.equal(profile.public, true);
  assert.equal(profile.automatedTestStatus, "passed");
  assert.equal(profile.route, "stream-copy");
  assert.equal(
    profile.maxTestedBytes,
    mpeg2Evidence.stressGate.sourceBytes,
  );
  assert.ok(
    profile.maxTestedBytes >= evidence.profile.maximumTestedSourceBytes,
  );
  assert.match(
    profile.metadataLimitations.join(" "),
    /MPEG-4 Part 2 or MPEG-2 video with optional MP3 audio/,
  );
});

test("the published AVI-capable core matches its build evidence", async () => {
  const wasmPath = path.join(
    projectRoot,
    "public",
    "engines",
    "remux",
    "within-remux.wasm",
  );
  const wasm = await readFile(wasmPath);
  assert.equal((await stat(wasmPath)).size, mpeg2Evidence.engineCandidate.withinRemuxWasmBytes);
  assert.equal(
    createHash("sha256").update(wasm).digest("hex"),
    mpeg2Evidence.engineCandidate.withinRemuxWasmSha256,
  );
  assert.equal(evidence.buildValidation.isolatedCandidateRun, 34158982139);
  assert.equal(evidence.status, "accepted-current-public-profile");
  assert.equal(evidence.buildValidation.exactReproductionRun, 34177452654);
  assert.equal(
    evidence.buildValidation.exactReproductionCommit,
    "bc0f3e25da6f7c9a37a1e176ba09d09181ad5aea",
  );
  assert.match(
    evidence.buildValidation.exactReproductionResult,
    /without Docker/,
  );
  assert.equal(evidence.buildValidation.retainedRunArtifacts, 0);
  assert.equal(evidence.buildValidation.diagnosticArtifactsDeleted, true);
  assert.equal(
    evidence.buildValidation.firstAllCoreReproductionRun,
    34161840479,
  );
  assert.equal(
    evidence.buildValidation.secondAllCoreReproductionRun,
    34175834034,
  );
  assert.equal(
    evidence.buildValidation.thirdAllCoreReproductionRun,
    34176535993,
  );
});

test("AVI browser and stress evidence is exact, bounded, indexed, cancellable, and cleaned", async () => {
  assert.equal(evidence.smallBrowserValidation.result, "3 passed");
  const stress = evidence.stressValidation;
  assert.ok(stress.source.bytes >= 128 * 1024 * 1024);
  assert.equal(stress.runs.length, 3);
  assert.ok(stress.worstIncrementalPrivateMiB <= stress.limitMiB);
  assert.equal(stress.limitMiB, 250);
  assert.equal(stress.maxReadChunkBytes, 256 * 1024);
  assert.equal(stress.maxWriteChunkBytes, 256 * 1024);
  assert.equal(stress.maxQueuedBytes, 256 * 1024);
  assert.equal(stress.maxPendingOperations, 1);
  assert.equal(stress.wasmMemoryBytes, 32 * 1024 * 1024);
  assert.equal(stress.completeNativeDecode, true);
  assert.equal(stress.exactVideoAndAudioPacketHashes, true);
  assert.equal(stress.midpointSeekPassed, true);
  assert.equal(stress.openDml.segmentCount, 20);
  assert.ok(
    stress.openDml.maximumObservedSegmentBytes <
      stress.openDml.configuredRiffLimitBytes +
        stress.source.maximumPacketBytes +
        1024 * 1024,
  );
  assert.equal(stress.openDml.masterIndexPresent, true);
  assert.equal(
    stress.openDml.videoStandardIndexCount,
    stress.openDml.segmentCount,
  );
  assert.equal(
    stress.openDml.audioStandardIndexCount,
    stress.openDml.segmentCount,
  );
  assert.equal(stress.passed, true);
  assert.equal(evidence.cancellationValidation.passed, true);
  assert.equal(
    evidence.cancellationValidation.sourceBytesProcessed,
    127 * 1024 * 1024,
  );
  assert.deepEqual(
    evidence.cancellationValidation.browserOwnedEntriesAfter,
    [],
  );
  assert.equal(evidence.cleanup.generatedStressSourcesDeleted, true);
  assert.equal(evidence.cleanup.generatedStressManifestsDeleted, true);
  assert.equal(evidence.cleanup.convertedOutputsDeleted, true);
  assert.equal(evidence.cleanup.failedStressReportsDeleted, true);
  assert.equal(evidence.cleanup.rawPassingReportsDeleted, true);
  assert.equal(evidence.cleanup.downloadedCandidateArtifactDeleted, true);
  assert.equal(
    evidence.cleanup.temporaryIsolationDiagnosticArtifactRetained,
    false,
  );
  assert.equal(evidence.cleanup.hostedMismatchArtifactsDeleted, true);
  assert.deepEqual(evidence.cleanup.workDirectoryContents, [".gitkeep"]);

  const browserTest = await readFile(
    path.join(projectRoot, "tests", "browser", "media-remux.spec.ts"),
    "utf8",
  );
  for (const anchor of [
    "Matroska MPEG-4 Part 2 and MP3 to genuine AVI",
    "AVI stream copy propagates a bounded write failure",
    "AVI stream copy retains only representable fields",
    "expectCompressedVideoPacketMatch",
    "expectCompressedAudioPacketMatch",
    "expectDecodedVideoMatch",
  ]) {
    assert.ok(browserTest.includes(anchor), anchor);
  }
});

test("the compact public-evidence manifest retains the deleted raw AVI report hash", async () => {
  const manifest = JSON.parse(
    await readFile(
      path.join(projectRoot, "evidence", "public-profile-evidence.json"),
      "utf8",
    ),
  );
  const profile = manifest.profiles.find(
    ({ profileId }) => profileId === evidence.profile.id,
  );
  assert.ok(profile);
  assert.equal(
    profile.maxTestedBytes,
    mpeg2Evidence.stressGate.sourceBytes,
  );
  assert.equal(profile.repeatableEvidence.runs, 3);
  assert.equal(
    profile.repeatableEvidence.reportSha256,
    mpeg2Evidence.stressGate.rawReportSha256,
  );
  assert.deepEqual(profile.maximumSizeEvidence, profile.repeatableEvidence);
});

test("the accepted AVI checkpoint is linked from every project ledger", async () => {
  for (const relativePath of ["README.md", "TESTED.md", "REMAINING_WORK.md"]) {
    const ledger = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(ledger.includes(evidenceName), relativePath);
    assert.ok(ledger.includes(mpeg2EvidenceName), relativePath);
  }
});

test("MPEG-2 AVI evidence is genuine, bounded, exact, and preserves rejected attempts", async () => {
  assert.deepEqual(mpeg2Evidence.requirements, ["P-08", "M-04"]);
  assert.equal(mpeg2Evidence.dockerUsed, false);
  assert.equal(mpeg2Evidence.smallBrowserGate.focusedMpeg2Cases, 4);
  assert.equal(mpeg2Evidence.smallBrowserGate.allAviSuccessCases, 9);
  assert.equal(mpeg2Evidence.stressGate.runs, 3);
  assert.ok(mpeg2Evidence.stressGate.sourceBytes >= 192 * 1024 * 1024);
  assert.ok(
    mpeg2Evidence.stressGate.worstIncrementalPrivateMiB <=
      mpeg2Evidence.stressGate.limitMiB,
  );
  assert.equal(mpeg2Evidence.stressGate.maximumReadBytes, 256 * 1024);
  assert.equal(mpeg2Evidence.stressGate.maximumWriteBytes, 256 * 1024);
  assert.equal(mpeg2Evidence.stressGate.maximumPendingOperations, 1);
  assert.equal(mpeg2Evidence.stressGate.wasmMemoryBytes, 32 * 1024 * 1024);
  assert.equal(mpeg2Evidence.stressGate.fullNativeDecode, true);
  assert.equal(mpeg2Evidence.stressGate.repeatableOutput, true);
  assert.equal(mpeg2Evidence.stressGate.cancellationCleanup, true);
  assert.equal(mpeg2Evidence.stressGate.openDmlSegments, 27);
  assert.ok(
    mpeg2Evidence.rejectedOrDeferred.some(
      ({ codec, result }) => codec === "h264" && result === "not advertised",
    ),
  );

  const browserTest = await readFile(
    path.join(projectRoot, "tests", "browser", "media-remux.spec.ts"),
    "utf8",
  );
  for (const anchor of [
    '["mkv", "mkv-to-avi", ["mpeg2video", "mp3"]]',
    '["mp4", "mp4-to-avi", ["mpeg2video"]]',
    '["mov", "mov-to-avi", ["mpeg2video"]]',
    '["mpeg-ts", "mpeg-ts-to-avi", ["mpeg2video"]]',
  ]) {
    assert.ok(browserTest.includes(anchor), anchor);
  }
});
