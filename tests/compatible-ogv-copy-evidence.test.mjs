import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { conversionProfiles } from "../lib/capability-registry.ts";

const projectRoot = path.resolve(import.meta.dirname, "..");
const evidenceName = "compatible-ogv-copy-2026-09-07.json";
const evidence = JSON.parse(
  await readFile(path.join(projectRoot, "evidence", evidenceName), "utf8"),
);

test("compatible OGV evidence matches the current public profile", () => {
  assert.deepEqual(evidence.requirements, ["P-08", "M-04"]);
  assert.equal(evidence.status, "accepted-current-public-profile");
  assert.equal(evidence.dockerUsed, false);
  const profile = conversionProfiles.find(({ id }) => id === evidence.profile.id);
  assert.ok(profile);
  assert.equal(profile.public, true);
  assert.equal(profile.automatedTestStatus, "passed");
  assert.equal(profile.route, "stream-copy");
  assert.equal(profile.maxTestedBytes, evidence.profile.maximumTestedSourceBytes);
  assert.match(profile.metadataLimitations.join(" "), /Theora video with optional Vorbis audio/);
});

test("the superseded OGV-capable core retains its accepted historical build evidence", () => {
  assert.equal(evidence.buildValidation.publishedWasmBytes, 9635289);
  assert.equal(
    evidence.buildValidation.publishedWasmSha256,
    "8d17f291c1b2f9d34df4e038be60e7960398261bfd26edc135666a7a2ed4af84",
  );
  assert.equal(evidence.buildValidation.isolatedCandidateRun, 34134662736);
  assert.equal(evidence.buildValidation.exactReproductionRun, 34136791033);
  assert.match(evidence.buildValidation.exactReproductionResult, /without Docker/);
  assert.equal(evidence.buildValidation.retainedRunArtifacts, 0);
  assert.equal(evidence.buildValidation.publicPromotionReproductionRun, 34139252534);
  assert.equal(
    evidence.buildValidation.publicPromotionReproductionCommit,
    "65b24884ba636e2e6323ae32318f108aced0dc4b",
  );
  assert.match(
    evidence.buildValidation.publicPromotionReproductionResult,
    /pushed public registry and manifest state/,
  );
  assert.equal(evidence.buildValidation.publicPromotionRetainedArtifacts, 0);
});

test("OGV browser and stress evidence is exact, bounded, cancellable, and cleaned", async () => {
  assert.equal(evidence.smallBrowserValidation.result, "2 passed");
  const stress = evidence.stressValidation;
  assert.ok(stress.source.bytes >= 128 * 1024 * 1024);
  assert.equal(stress.runs.length, 3);
  assert.ok(stress.worstIncrementalPrivateMiB <= stress.limitMiB);
  assert.equal(stress.limitMiB, 250);
  assert.equal(stress.maxReadChunkBytes, 256 * 1024);
  assert.ok(stress.maxWriteChunkBytes <= 256 * 1024);
  assert.ok(stress.maxQueuedBytes <= 256 * 1024);
  assert.equal(stress.maxPendingOperations, 1);
  assert.equal(stress.wasmMemoryBytes, 32 * 1024 * 1024);
  assert.equal(stress.completeNativeDecode, true);
  assert.equal(stress.exactVideoAndAudioPacketHashes, true);
  assert.equal(stress.passed, true);
  assert.equal(evidence.cancellationValidation.passed, true);
  assert.ok(evidence.cancellationValidation.sourceBytesProcessed >= 128 * 1024 * 1024);
  assert.deepEqual(evidence.cancellationValidation.browserOwnedEntriesAfter, []);
  assert.equal(evidence.cleanup.generatedStressSourcesDeleted, true);
  assert.equal(evidence.cleanup.convertedOutputsDeleted, true);
  assert.deepEqual(evidence.cleanup.workDirectoryContents, [".gitkeep"]);

  const browserTest = await readFile(
    path.join(projectRoot, "tests", "browser", "media-remux.spec.ts"),
    "utf8",
  );
  for (const anchor of [
    "browser FFmpeg losslessly remuxes Matroska Theora and Vorbis to OGV",
    "OGV stream copy propagates a bounded write failure",
    "expectCompressedVideoPacketMatch",
    "expectCompressedAudioPacketMatch",
    "expectDecodedVideoMatch",
  ]) {
    assert.ok(browserTest.includes(anchor), anchor);
  }
});

test("the accepted OGV checkpoint is linked from every project ledger", async () => {
  for (const relativePath of ["README.md", "TESTED.md", "REMAINING_WORK.md"]) {
    const ledger = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(ledger.includes(evidenceName), relativePath);
  }
});
