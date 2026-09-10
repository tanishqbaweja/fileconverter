import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { conversionProfiles } from "../lib/capability-registry.ts";

const projectRoot = path.resolve(import.meta.dirname, "..");
const evidenceName = "ivf-extraction-browser-2026-09-09.json";
const evidence = JSON.parse(
  await readFile(path.join(projectRoot, "evidence", evidenceName), "utf8"),
);

test("IVF evidence matches both public bounded packet-copy profiles", () => {
  assert.equal(evidence.status, "passed");
  assert.equal(evidence.dockerUsed, false);
  assert.match(evidence.conversionClass, /packet copy/);
  for (const route of evidence.routes) {
    const profile = conversionProfiles.find(({ id }) => id === route.profileId);
    assert.ok(profile, route.profileId);
    assert.equal(profile.public, true);
    assert.equal(profile.automatedTestStatus, "passed");
    assert.equal(profile.route, "stream-copy");
    assert.equal(profile.output, "ivf");
    assert.equal(profile.maxTestedBytes, route.sourceBytes);
    assert.match(
      profile.metadataLimitations.join(" "),
      /first non-attached video/,
    );
    assert.match(
      profile.metadataLimitations.join(" "),
      /Audio.*explicitly excluded/,
    );
  }
});

test("IVF stress evidence is repeatable, genuine, exact, bounded, cancellable, and cleaned", () => {
  assert.equal(evidence.routes.length, 2);
  for (const route of evidence.routes) {
    assert.ok(route.sourceBytes >= 128 * 1024 * 1024);
    assert.equal(route.runs.length, 3);
    assert.ok(route.peakIncrementalPrivateMiB <= evidence.memoryLimitMiB);
    assert.ok(route.runs.every(({ elapsedMs }) => elapsedMs > 0));
    assert.ok(
      route.runs.every(
        ({ throughputMiBPerSecond }) => throughputMiBPerSecond >= 175,
      ),
    );
  }
  assert.equal(evidence.repeatableOutput.identicalAcrossAllSixRuns, true);
  assert.equal(evidence.independentValidation.signature, "DKIF");
  assert.equal(evidence.independentValidation.fourCc, "VP90");
  assert.equal(evidence.independentValidation.compressedPacketsExact, true);
  assert.equal(evidence.independentValidation.decodedFramesExact, true);
  assert.equal(evidence.independentValidation.fullDecodePassed, true);
  assert.equal(evidence.independentValidation.midpointSeekPassed, true);
  assert.equal(evidence.cancellation.passedForBothRoutes, true);
  assert.equal(evidence.cancellation.partialOutputRemoved, true);
  assert.equal(evidence.cancellation.pendingOperationsAfterCancellation, 0);
  assert.equal(evidence.cancellation.queuedBytesAfterCancellation, 0);
  assert.equal(
    evidence.releaseGates.completeMediaBrowserRegression,
    "530/530 passed in 11.0 minutes",
  );
  assert.equal(
    evidence.releaseGates.privacyOfflineBrowserRegression,
    "15/15 passed in 57.3 seconds",
  );
  assert.deepEqual(evidence.cleanup.workDirectoryEntries, [".gitkeep"]);
  assert.equal(evidence.cleanup.largeGeneratedSourcesRetained, 0);
  assert.equal(evidence.cleanup.convertedOutputsRetained, 0);
});

test("the published IVF checkpoint matches its candidate build evidence", () => {
  const publicationCommit = evidence.build.publicationReproduction.commit;
  for (const [relativePath, expectedBytes, expectedSha256] of [
    [
      "public/engines/remux/within-remux.wasm",
      evidence.build.candidateWasmBytes,
      evidence.build.candidateWasmSha256,
    ],
    [
      "public/engines/remux/within-remux.mjs",
      evidence.build.candidateGlueBytes,
      evidence.build.candidateGlueSha256,
    ],
    [
      "public/engines/remux/build-manifest.json",
      evidence.build.candidateManifestBytes,
      evidence.build.candidateManifestSha256,
    ],
  ]) {
    const bytes = execFileSync("git", [
      "show",
      `${publicationCommit}:${relativePath}`,
    ], {
      cwd: projectRoot,
      windowsHide: true,
      maxBuffer: 16 * 1024 * 1024,
    });
    assert.equal(bytes.byteLength, expectedBytes);
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      expectedSha256,
    );
  }
});

test("the pushed IVF core has exact no-Docker publication evidence", () => {
  const publication = evidence.build.publicationReproduction;
  assert.equal(publication.workflowRun, 34342108068);
  assert.equal(
    publication.url,
    "https://github.com/tanishqbaweja/fileconverter/actions/runs/34342108068",
  );
  assert.equal(
    publication.commit,
    "8f38ffee357c77d072597896ebcaf5369eaa062a",
  );
  assert.equal(publication.result, "passed");
  assert.equal(publication.allSixFfmpegModulesByteExact, true);
  assert.equal(publication.mismatchArtifactUploadSkipped, true);
  assert.equal(publication.hostedRepositoryLocalCleanupPassed, true);
  assert.equal(publication.retainedArtifacts, 0);
  assert.equal(publication.candidateArtifactDeletedAndVerifiedAbsent, true);
  assert.equal(publication.dockerUsed, false);
});

test("IVF compact evidence and project ledgers agree", async () => {
  const manifest = JSON.parse(
    await readFile(
      path.join(projectRoot, "evidence", "public-profile-evidence.json"),
      "utf8",
    ),
  );
  for (const route of evidence.routes) {
    const compact = manifest.profiles.find(
      ({ profileId }) => profileId === route.profileId,
    );
    assert.ok(compact, route.profileId);
    assert.equal(compact.maxTestedBytes, route.sourceBytes);
    assert.equal(compact.repeatableEvidence.runs, 3);
    assert.equal(
      compact.repeatableEvidence.reportSha256,
      route.rawReportSha256,
    );
    assert.deepEqual(compact.maximumSizeEvidence, compact.repeatableEvidence);
  }
  for (const relativePath of ["README.md", "TESTED.md", "REMAINING_WORK.md"]) {
    const ledger = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(ledger.includes(evidenceName), relativePath);
  }
});

test("IVF browser tests retain success, rejection, and write-failure anchors", async () => {
  const browserTest = await readFile(
    path.join(projectRoot, "tests", "browser", "media-remux.spec.ts"),
    "utf8",
  );
  for (const anchor of [
    'label: "Matroska AV1"',
    'label: "WebM VP8"',
    'label: "WebM VP9"',
    "genuinely extracts ${route.label} video to bounded IVF",
    "IVF preflight blocks an incompatible first Matroska video stream",
    "IVF extraction propagates bounded write failure and removes its partial output",
    "expectIvfStructure",
  ]) {
    assert.ok(browserTest.includes(anchor), anchor);
  }
});

test("IVF input stress routes stay wired into the shared profiler", async () => {
  const [categorySource, profilerSource] = await Promise.all([
    readFile(
      path.join(projectRoot, "scripts", "profile-category.mjs"),
      "utf8",
    ),
    readFile(path.join(projectRoot, "scripts", "memory-profile.mjs"), "utf8"),
  ]);
  for (const route of ["ivf-to-webm", "ivf-to-mkv"]) {
    assert.ok(categorySource.includes(`["${route}",`), route);
    assert.ok(profilerSource.includes(`"${route}"`), route);
  }
  assert.ok(profilerSource.includes("...IVF_INPUT_PROFILES"));
  assert.match(
    profilerSource,
    /const isIvfProfile =[\s\S]*IVF_INPUT_PROFILES\.includes\(profileId\)/,
  );
  assert.match(
    profilerSource,
    /cancellationCleanup:[\s\S]*!isIvfProfile/,
  );
  assert.match(
    profilerSource,
    /!videoOnlyCopy &&[\s\S]*audio\?\.channels !==/,
  );
  assert.ok(
    profilerSource.includes(
      "(compatibleWebmCopy || liveMatroskaCopy) &&",
    ),
  );
});
