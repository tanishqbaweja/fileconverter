import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const projectRoot = path.resolve(import.meta.dirname, "..");
const evidenceName = "matroska-attached-picture-browser-2026-09-06.json";
const evidence = JSON.parse(
  await readFile(path.join(projectRoot, "evidence", evidenceName), "utf8"),
);

test("M-03 attached-picture evidence proves bounded exact browser retention", () => {
  assert.equal(evidence.status, "verified-current-public-profiles");
  assert.equal(evidence.dockerUsed, false);
  assert.equal(evidence.browserValidation.focusedResult, "1 passed");
  assert.equal(evidence.browserValidation.affectedResult, "14 passed");
  assert.equal(evidence.implementation.imageHandling.includes("without image decode"), true);
  assert.deepEqual(evidence.implementation.bounds, {
    supportedCodecs: ["mjpeg", "png"],
    maximumImages: 8,
    maximumBytesPerImage: 4 * 1024 * 1024,
    maximumTotalBytes: 8 * 1024 * 1024,
    maximumDimension: 4096,
    maximumPixelsPerImage: 16 * 1024 * 1024,
  });
  assert.equal(
    evidence.sourceFixture.attachedPicture.sha256,
    "a2c9b09a676abe1df460620135bd1d889ddfb84de2f665b08c95374ec10564f0",
  );
  assert.match(evidence.scope, /closes M-03 for every currently public profile/);
});

test("the browser gate covers representation, payloads, bounds, and cleanup", async () => {
  const source = await readFile(
    path.join(projectRoot, "tests/browser/media-remux.spec.ts"),
    "utf8",
  );
  for (const anchor of [
    "preserves bounded attached picture as a Matroska cover attachment",
    'compressedPacketSha256(outputPath, "v:1")',
    "expectDecodedVideoMatch(videoArtworkFixturePath, outputPath)",
    "expectAacAccessUnitMatch(videoArtworkFixturePath, outputPath)",
    'mediaTag(cover?.tags, "filename")',
    'mediaTag(cover?.tags, "mimetype")',
    "await rm(videoArtworkFixturePath, { force: true })",
    "await rm(videoArtworkOutputPath, { force: true })",
  ]) {
    assert.ok(source.includes(anchor), anchor);
  }
  assert.equal(evidence.cleanup.convertedOutputsRetained, 0);
  assert.equal(evidence.cleanup.generatedSourceFixturesRetained, 0);
  assert.equal(evidence.cleanup.candidateDownloadsRetained, 0);
  assert.equal(evidence.cleanup.remoteCandidateArtifactsRetained, 0);
});

test("the published artifact is exact, reproducible, and linked in every ledger", async () => {
  assert.equal(
    evidence.buildValidation.publishedWasmSha256,
    "44b302dd43f69aaf8045666b24e60d3b90f56a51263a42fe3764e2ac000749d0",
  );
  assert.match(evidence.buildValidation.publicationResult, /every FFmpeg artifact/);
  for (const relativePath of ["README.md", "TESTED.md", "REMAINING_WORK.md"]) {
    const source = await readFile(path.join(projectRoot, relativePath), "utf8");
    assert.ok(source.includes(evidenceName), relativePath);
  }
});
