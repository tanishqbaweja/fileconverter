import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareH264VaaSpeed } from "../scripts/lib/h264-vaa-speed-comparison.mjs";
const evidence = JSON.parse(await readFile(new URL("../evidence/h264-vaa-simd-comparison-2026-10-04.json", import.meta.url)));
const arithmetic = JSON.parse(await readFile(new URL("../evidence/openh264-vaa-arithmetic-2026-10-04.json", import.meta.url)));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("genuine browser VAA SIMD trial is rejected as slower despite byte-identical fidelity and memory passes", () => {
  assert.equal(evidence.status, "vaa-simd-not-accepted");
  const result = compareH264VaaSpeed(evidence.reports[0].report, evidence.reports[1].report, arithmetic);
  assert.deepEqual(result, evidence.comparison);
  assert.equal(result.allPrivateGatesPassed, true);
  assert.equal(result.privateOptimizationCandidatePassed, false);
  assert.ok(result.measuredSpeedupFraction < -0.09);
  assert.equal(result.baselineMedianMs, 23916.179999999702);
  assert.equal(result.candidateMedianMs, 26115.585000000894);
  assert.equal(result.publicAcceptance, false);
  for (const item of evidence.reports) {
    assert.equal(sha(`${JSON.stringify(item.report, null, 2)}\n`), item.sha256);
    assert.equal(item.report.requestedRunCount, 3);
    assert.equal(item.report.cpuEnabled, false);
    assert.equal(item.report.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved, true);
    for (const run of item.report.runs) {
      assert.equal(run.independentValidation.outputBytes, 19137689);
      assert.equal(run.independentValidation.ordinalSsim, 0.987575);
      assert.equal(run.independentValidation.maximumFrameTimeErrorSeconds, 0);
    }
  }
});
test("SIMD private build and retained comparison bind exact provenance without changing public assets", async () => {
  assert.equal(evidence.build.headSha, "3a8395edd54eef9411b9f5b77b45c07c74616959");
  assert.equal(evidence.build.status, "completed"); assert.equal(evidence.build.conclusion, "success");
  assert.equal(evidence.build.remainingRemoteArtifacts, 0);
  assert.equal(evidence.build.sourceBundleDownloaded, false);
  const manifest = evidence.reports[1].report.asBuiltManifest;
  assert.equal(manifest.openh264VaaSimd, true); assert.equal(manifest.libraryLinkTimeOptimization, false);
  assert.equal(manifest.artifacts["within-h264.wasm"], "b80c9ea2d6457502c4a511b7781bd502ab0b34c35c8b71b40e63bd473a9d34c6");
  assert.equal(evidence.cleanup.convertedMediaBytesInWork, 0);
  for (const [file, expected] of Object.entries(evidence.currentSources)) assert.equal(sha(await readFile(new URL(`../${file}`, import.meta.url))), expected, file);
  for (const [file, expected] of Object.entries(evidence.cleanup.distHashes)) assert.equal(sha(await readFile(new URL(`../public/engines/remux/${file}`, import.meta.url))), expected, file);
});
