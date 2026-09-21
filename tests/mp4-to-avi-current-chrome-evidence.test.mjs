import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { conversionProfiles } from "../lib/capability-registry.ts";

const evidence = JSON.parse(
  readFileSync(
    "evidence/mp4-to-avi-current-chrome-optimization-2026-09-21.json",
    "utf8",
  ),
);
const worker = readFileSync("workers/conversion.worker.ts", "utf8");
const app = readFileSync("app/converter/ConverterApp.tsx", "utf8");
const cleanup = readFileSync("scripts/cleanup-generated.mjs", "utf8");

test("current Chrome MP4-to-AVI evidence keeps the public route within every gate", () => {
  const profile = conversionProfiles.find(({ id }) => id === "mp4-to-avi");
  const accepted = evidence.browser.acceptedDirectDestination;
  assert.ok(profile);
  assert.equal(profile.public, true);
  assert.equal(profile.automatedTestStatus, "passed");
  assert.equal(profile.maxTestedBytes, evidence.stressSource.bytes);
  assert.equal(evidence.dockerUsed, false);
  assert.equal(accepted.passed, true);
  assert.equal(accepted.runs, 3);
  assert.ok(accepted.worstIncrementalPrivateMiB <= 250);
  assert.equal(accepted.maximumPendingOperations, 1);
  assert.equal(accepted.maxReadChunkBytes, 256 * 1024);
  assert.equal(accepted.maxWriteChunkBytes, 256 * 1024);
  assert.equal(accepted.scratchBytesAfterEachRun, 0);
  assert.equal(accepted.cancellation.passed, true);
  assert.equal(
    accepted.cancellation.phaseAtTrigger,
    "Copying staged AVI to selected destination",
  );
  assert.equal(evidence.output.sourceAndOutputCompressedPacketsMatch, true);
  assert.equal(evidence.output.fullNativeDecodePassed, true);
  assert.equal(evidence.output.repeatableOutputHash, true);
});

test("accepted optimization remains faster and smaller than the unchanged direct baseline", () => {
  const baseline = evidence.browser.unchangedDirectBaseline;
  assert.equal(baseline.passed, false);
  assert.ok(baseline.incrementalPrivateMiB.some((value) => value > 250));
  assert.ok(evidence.performanceComparison.timesFaster > 11);
  assert.ok(evidence.performanceComparison.elapsedReductionPercent > 90);
  assert.ok(evidence.performanceComparison.worstMemoryReductionMiB > 50);
  assert.equal(
    evidence.performanceComparison.outputBytesAndSha256Identical,
    true,
  );
});

test("staging, cleanup, and discarded candidates remain auditable", () => {
  assert.match(worker, /openStagedDirectDestination/);
  assert.match(worker, /readAccess\.read\(buffer, { at: copiedBytes }\)/);
  assert.match(app, /within-stage-\$\{batch\.profile\.id\}/);
  assert.match(cleanup, /temp-current-chrome/);
  assert.match(cleanup, /2026-09-21T11-21-08-984Z-mp4-to-avi-direct-handle-stress/);
  assert.ok(
    evidence.rejectedCandidates.some(
      ({ laterFailureIncrementalPrivateMiB }) =>
        laterFailureIncrementalPrivateMiB > 250,
    ),
  );
  assert.equal(evidence.cleanup.generatedSourceDeleted, true);
  assert.equal(evidence.cleanup.rawReportsDeletedAfterCompactManifestGeneration, true);
  assert.equal(evidence.cleanup.protectedTestMkvUnmodified, true);
});
