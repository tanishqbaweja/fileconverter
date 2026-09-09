import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  conversionProfiles,
  publicProfilesFor,
} from "../lib/capability-registry.ts";

const projectRoot = path.resolve(import.meta.dirname, "..");
const evidenceName = "raw-hevc-webm-feasibility-2026-09-09.json";
const evidence = JSON.parse(
  await readFile(path.join(projectRoot, "evidence", evidenceName), "utf8"),
);
const buildManifest = JSON.parse(
  await readFile(
    path.join(projectRoot, "public", "engines", "remux", "build-manifest.json"),
    "utf8",
  ),
);

async function sha256(relativePath) {
  return createHash("sha256")
    .update(await readFile(path.join(projectRoot, relativePath)))
    .digest("hex");
}

test("raw HEVC exposes only the accepted VP8 WebM route", () => {
  assert.equal(evidence.status, "vp8-accepted-public-vp9-withheld");
  assert.equal(evidence.dockerUsed, false);
  assert.deepEqual(
    publicProfilesFor("hevc")
      .filter(({ input }) => input === "hevc")
      .map(({ id }) => id),
    ["hevc-to-webm"],
  );

  const vp8 = conversionProfiles.find(({ id }) => id === "hevc-to-webm");
  assert.ok(vp8);
  assert.equal(vp8.public, true);
  assert.equal(vp8.automatedTestStatus, "passed");
  assert.equal(vp8.maxTestedBytes, evidence.stressSource.bytes);
  assert.equal(vp8.route, "re-encode");

  const vp9 = conversionProfiles.find(({ id }) => id === "hevc-to-webm-vp9");
  assert.ok(vp9);
  assert.equal(vp9.public, false);
  assert.equal(vp9.automatedTestStatus, "failed");
  assert.equal(vp9.maxTestedBytes, null);
});

test("accepted HEVC conversion is genuine, repeatable, bounded, and optimized", () => {
  const accepted = evidence.acceptedProfile;
  assert.equal(accepted.conversionMode, "genuine-decode-scale-reencode");
  assert.equal(accepted.codec, "vp8");
  assert.equal(accepted.runs, 3);
  assert.equal(accepted.repeatableOutput, true);
  assert.equal(accepted.fullNativeDecode, true);
  assert.equal(accepted.outputPackets, evidence.stressSource.packets);
  assert.equal(accepted.outputFrames, evidence.stressSource.decodedFrames);
  assert.equal(accepted.outputDurationSeconds, 691.24);
  assert.ok(accepted.worstIncrementalPrivateMiB <= accepted.limitMiB);
  assert.equal(accepted.limitMiB, 250);
  assert.equal(accepted.maximumReadBytes, 256 * 1024);
  assert.equal(accepted.maximumWriteBytes, 256 * 1024);
  assert.equal(accepted.maximumQueuedBytes, 256 * 1024);
  assert.equal(accepted.maximumPendingOperations, 1);
  assert.equal(accepted.wasmMemoryBytes, 56 * 1024 * 1024);
  assert.equal(accepted.passed, true);
  assert.equal(evidence.smallBrowserGate.vp8WriteFailure, "passed");
  assert.equal(evidence.smallBrowserGate.vp8Cancellation, "passed");
  assert.equal(
    evidence.smallBrowserGate.partialOutputsAfterFailureOrCancellation,
    0,
  );

  const fast = evidence.optimizationTrials.find(
    ({ profileId }) => profileId === "hevc-to-webm",
  );
  assert.ok(fast);
  assert.equal(fast.result, "rejected-memory");
  assert.ok(fast.elapsedSeconds.every((seconds) => seconds < 160));
  assert.ok(fast.worstIncrementalPrivateMiB > fast.limitMiB);
  assert.equal(evidence.optimizationDecision.thresholdsWeakened, false);
});

test("VP9 trials retain the exact reason the route is withheld", () => {
  const vp9Trials = evidence.optimizationTrials.filter(
    ({ profileId }) => profileId === "hevc-to-webm-vp9",
  );
  assert.equal(vp9Trials.length, 2);
  assert.ok(
    vp9Trials.some(
      ({ result, worstIncrementalPrivateMiB, limitMiB }) =>
        result === "rejected-memory" &&
        worstIncrementalPrivateMiB > limitMiB,
    ),
  );
  const singleThread = vp9Trials.find(
    ({ result }) => result === "withheld-insufficient-headroom-and-speed",
  );
  assert.ok(singleThread);
  assert.equal(singleThread.memoryHeadroomMiB, 0.24609375);
  assert.ok(singleThread.elapsedSeconds[0] > 560);
});

test("published engine files match the hosted no-Docker candidate", async () => {
  assert.equal(evidence.engineCandidate.buildMethod.includes("without Docker"), true);
  for (const [moduleName, expectedHash] of Object.entries(
    evidence.engineCandidate.wasmSha256,
  )) {
    assert.equal(
      await sha256(`public/engines/remux/${moduleName}.wasm`),
      expectedHash,
      moduleName,
    );
  }
  assert.ok(buildManifest.enabledDemuxers.includes("hevc"));
  const vp8Module = buildManifest.modules.find(
    ({ name }) => name === "within-webm-quality",
  );
  assert.equal(vp8Module.wasmPthreadPoolSize, 4);
  assert.equal(vp8Module.videoCodecThreads, 2);
  assert.ok(vp8Module.profiles.includes("hevc-to-webm"));
});

test("the pushed HEVC engine is exactly reproduced and temporary data is deleted", () => {
  assert.equal(evidence.publication.status, "success");
  assert.equal(
    evidence.publication.sourceCommit,
    "082b05061d02379cd8ed04a3f249df70f5ffda2b",
  );
  assert.equal(evidence.publication.workflowRunId, 34390070004);
  assert.equal(evidence.publication.allSixFfmpegModulesByteExact, true);
  assert.equal(evidence.publication.hostedCleanupPassed, true);
  assert.equal(evidence.publication.mismatchUploadSkipped, true);
  assert.equal(evidence.publication.retainedArtifactCount, 0);
  assert.equal(evidence.publication.dockerUsed, false);
  assert.equal(evidence.cleanup.rawReportsDeletedAfterCompaction, true);
  assert.equal(evidence.cleanup.candidateDownloadDeleted, true);
  assert.deepEqual(evidence.cleanup.workDirectoryContents, [".gitkeep"]);
  assert.equal(evidence.cleanup.candidateArtifactDeletedAfterPublication, true);
  assert.equal(evidence.cleanup.candidateArtifactDeletionVerifiedHttpStatus, 404);
});

test("HEVC acceptance is linked from every project ledger", async () => {
  for (const relativePath of ["README.md", "TESTED.md", "REMAINING_WORK.md"]) {
    const ledger = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(ledger.includes(evidenceName), relativePath);
  }
});
