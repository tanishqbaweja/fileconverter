import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { conversionProfiles, formatById } from "../lib/capability-registry.ts";

const projectRoot = path.resolve(import.meta.dirname, "..");
const evidenceName = "compatible-webm-copy-2026-09-07.json";
const evidence = JSON.parse(
  await readFile(path.join(projectRoot, "evidence", evidenceName), "utf8"),
);

test("compatible WebM evidence matches the current public profile", () => {
  assert.deepEqual(evidence.requirements, ["P-08", "M-04"]);
  assert.equal(evidence.status, "accepted-current-public-profile");
  assert.equal(evidence.dockerUsed, false);
  const profile = conversionProfiles.find(({ id }) => id === evidence.profile.id);
  assert.ok(profile);
  assert.equal(profile.public, true);
  assert.equal(profile.automatedTestStatus, "passed");
  assert.equal(profile.route, "stream-copy");
  assert.equal(formatById(profile.output)?.label, evidence.profile.publicDestinationLabel);
  assert.match(profile.metadataLimitations.join(" "), /AV1, VP8, or VP9/);
  assert.deepEqual(evidence.profile.videoCodecs, ["av1", "vp8", "vp9"]);
  assert.deepEqual(evidence.profile.audioCodecs, ["opus", "vorbis"]);
});

test("the accepted WebM build checkpoint remains historically pinned", () => {
  assert.equal(evidence.buildValidation.publishedWasmBytes, 9_634_049);
  assert.equal(
    evidence.buildValidation.publishedWasmSha256,
    "9f7b79c69bdd4291cb8d4b4056f0425bbf285d35f9fdcf887c0a5018d4954fd0",
  );
  assert.equal(evidence.buildValidation.isolatedCandidateRun, 34105896026);
  assert.match(evidence.buildValidation.isolatedCandidateOutcome, /Only within-remux\.wasm differed/);
  assert.equal(evidence.buildValidation.exactReproductionRun, 34107308417);
  assert.match(evidence.buildValidation.exactReproductionResult, /byte-for-byte/);
  assert.equal(evidence.buildValidation.retainedRunArtifacts, 0);
});

test("VP8 and VP9 production-browser copy validation is exact and bounded", async () => {
  assert.equal(evidence.smallBrowserValidation.result, "2 passed");
  assert.deepEqual(
    evidence.smallBrowserValidation.cases.map(({ codec }) => codec),
    ["vp8", "vp9"],
  );
  for (const browserCase of evidence.smallBrowserValidation.cases) {
    assert.equal(browserCase.videoPacketSha256.length, 64);
    assert.equal(browserCase.audioPacketSha256.length, 64);
    assert.ok(browserCase.outputBytes > 100_000);
    assert.ok(browserCase.elapsedMs > 0);
  }
  assert.equal(evidence.repeatabilityBenchmark.copyElapsedMs.length, 3);
  assert.equal(evidence.repeatabilityBenchmark.priorBehavior, "blocked-no-vp9-decoder");
  assert.match(evidence.repeatabilityBenchmark.comparisonBoundary, /not reported as a re-encode speedup/);

  const browserTest = await readFile(
    path.join(projectRoot, "tests", "browser", "media-options.spec.ts"),
    "utf8",
  );
  for (const anchor of [
    "generic WebM automatically stream-copies compatible VP8 and VP9 Matroska",
    "compatible WebM copy is repeatable while unsupported VP9 re-encoding stays blocked",
    "copiedStreamPayloadSha256",
    "no certified VP9 decoder",
  ]) {
    assert.ok(browserTest.includes(anchor), anchor);
  }
});

test("new-binary VP9 stress evidence passes the unchanged memory and cleanup gates", () => {
  const stress = evidence.stressValidation;
  assert.equal(stress.source.videoCodec, "vp9");
  assert.equal(stress.source.audioCodec, "opus");
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
  assert.equal(stress.decodedVideoAndAudioHashesMatchSource, true);
  assert.equal(stress.passed, true);
  assert.ok(stress.runs.every(({ cleanupDeltaFromLoadedMiB }) => cleanupDeltaFromLoadedMiB < 0));
  assert.equal(evidence.cleanup.generatedStressSourceDeleted, true);
  assert.equal(evidence.cleanup.convertedOutputsDeleted, true);
  assert.deepEqual(evidence.cleanup.workDirectoryContents, [".gitkeep"]);
});

test("the accepted checkpoint is linked from every project ledger", async () => {
  for (const relativePath of ["README.md", "TESTED.md", "REMAINING_WORK.md"]) {
    const ledger = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(ledger.includes(evidenceName), relativePath);
  }
});
