import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { provenSourceSha } from "./helpers/nondocker-workflow-provenance.mjs";

const evidence = JSON.parse(await readFile(new URL("../evidence/openh264-vaa-arithmetic-2026-10-04.json", import.meta.url), "utf8"));
test("actual compiled VAA equivalence records complete finite coverage without conversion acceptance", () => {
  assert.equal(evidence.status, "compiled-private-simd-arithmetic-equivalence-passed-not-integrated");
  assert.equal(evidence.publicAcceptance, false);
  assert.equal(evidence.speedGainClaim, null);
  assert.equal(evidence.browserConversions, 0);
  const [failed, passed] = evidence.attempts;
  assert.equal(failed.run.status, "completed"); assert.equal(failed.run.conclusion, "failure");
  assert.equal(failed.report.totalCases, 0);
  assert.match(failed.report.error, /HEAPU8.*not exported/);
  assert.equal(passed.run.status, "completed"); assert.equal(passed.run.conclusion, "success");
  assert.equal(passed.run.headSha, "be2c875a4a3e581d0afbb1040f8acd99bcdb048f");
  assert.equal(passed.report.totalCases, 132101); assert.equal(passed.report.checkedQuadrants, 1090864);
  assert.deepEqual(passed.report.cases, {
    exhaustiveUniformBytePairs: 65536, exhaustiveMixedSignBytePairs: 65536,
    singlePixelQuadrantAndLane: 512, seededRandomStrideAlignmentAndDimensions: 512,
    maximumDimensionsAndFrameOverflow: 4, sourceEndsAtWasmMemoryBoundary: 1,
  });
  assert.equal(failed.report.wasmSha256, passed.report.wasmSha256, "Heap export corrected JS access, not arithmetic instructions");
  assert.equal(failed.report.generatedReferenceSha256, passed.report.generatedReferenceSha256);
  assert.match(passed.report.coverageLimitation, /not exhaustive enumeration/);
  assert.match(passed.report.overflowScope, /not a portable signed-overflow guarantee/);
  for (const attempt of evidence.attempts) {
    assert.equal(attempt.remainingHostedArtifacts, 0);
    assert.equal(attempt.run.jobs[0].steps.find((step) => step.name === "Remove repository-local build data").conclusion, "success");
    assert.equal(attempt.report.publicAcceptance, false);
    assert.equal(attempt.report.conversionBuildsChanged, false);
    assert.equal(createHash("sha256").update(`${JSON.stringify(attempt.report, null, 2)}\n`).digest("hex"), attempt.reportSha256);
  }
  assert.equal(evidence.cleanup.downloadedReportsCompactedThenRemoved, true);
});
test("private arithmetic evidence binds the actually proven helper and harness to current source bytes", async () => {
  for (const [file, expected] of Object.entries(evidence.currentSources)) {
    assert.equal(provenSourceSha(file, await readFile(new URL(`../${file}`, import.meta.url)), expected), expected, file);
  }
  assert.equal(evidence.attempts[1].report.sourceHashes["media/ffmpeg/openh264-vaa-simd.h"],
    evidence.currentSources["media/ffmpeg/openh264-vaa-simd.h"]);
  assert.ok(evidence.remaining.includes("Production browser identical-settings speed A/B"));
});
