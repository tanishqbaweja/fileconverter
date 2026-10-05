import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { provenSourceSha } from "./helpers/nondocker-workflow-provenance.mjs";

const evidence = JSON.parse(await readFile(new URL("../evidence/openh264-sad-arithmetic-2026-10-04.json", import.meta.url)));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
test("compiled SAD proof retains finite coverage, provenance and terminal cleanup without conversion acceptance", async () => {
  const { report, run } = evidence;
  assert.equal(evidence.status, "compiled-private-sad-equivalence-and-primitive-cost-not-integrated");
  assert.equal(evidence.publicAcceptance, false); assert.equal(evidence.browserConversions, 0);
  assert.equal(evidence.speedGainClaim, null);
  assert.equal(run.status, "completed"); assert.equal(run.conclusion, "success");
  assert.equal(run.headSha, "5950ef50eba4aee733f46b66855dcd1cca8813f0");
  assert.equal(run.jobs[0].steps.find((s) => s.name === "Remove repository-local build data").conclusion, "success");
  assert.equal(report.totalCases, 529564);
  assert.deepEqual(report.cases, {
    exhaustiveUniformBytePairs: 262144, exhaustiveMixedSignBytePairs: 262144,
    singlePixelLaneAndRow: 1152, seededRandomIndependentStrideAndAlignment: 4096,
    zeroAndOverlappingNonnegativeStrides: 20, inputEndsExactlyAtWasmBoundary: 8,
  });
  assert.equal(report.conversionBuildsChanged, false);
  assert.equal(report.upstream.sha256, "82c47be2c051aa92079ac0c731818c4a33612c6dbe61534ada5c0ac5c33667ae");
  assert.match(report.coverageLimitation, /not exhaustive enumeration/);
  assert.equal(report.initialWasmMemoryBytes, 33554432); assert.equal(report.maximumWasmMemoryBytes, 33554432);
  assert.equal(sha(`${JSON.stringify(report, null, 2)}\n`), evidence.reportSha256);
  for (const [file, hash] of Object.entries(evidence.currentSources)) assert.equal(provenSourceSha(file, await readFile(new URL(`../${file}`, import.meta.url)), hash), hash, file);
  for (const file of ["media/ffmpeg/openh264-sad-simd.h", "media/ffmpeg/openh264-sad-arithmetic.cpp", "scripts/lib/openh264-sad-reference.mjs"]) {
    assert.equal(evidence.currentSources[file], report.sourceHashes[file], "Current helper/oracle exactly matches the compiled proof");
  }
  assert.equal(evidence.artifact.remaining, 0); assert.equal(evidence.cleanup.hostedArtifactsRemaining, 0);
  assert.equal(evidence.cleanup.hostedSdkBuildScratchRemoved, true);
  assert.equal(evidence.cleanup.downloadedReportCompactedThenRemoved, true);
  assert.equal(evidence.cleanup.localCompilerOrConvertedMediaGenerated, false);
});
test("SAD warm primitive pairs alternate order, preserve checksums and do not claim browser throughput", () => {
  const median = (values) => [...values].sort((a, b) => a - b)[values.length >> 1];
  assert.deepEqual(evidence.report.shapes, ["8x8", "16x8", "8x16", "16x16"]);
  for (const [index, b] of evidence.report.benchmarks.entries()) {
    assert.equal(b.shape, evidence.report.shapes[index]); assert.equal(b.pairs.length, 7);
    assert.ok(b.iterations >= 100000 && b.iterations <= 2000000);
    for (const [round, pair] of b.pairs.entries()) {
      assert.deepEqual(pair.order, round & 1 ? ["simd", "scalar"] : ["scalar", "simd"]);
      assert.equal(pair.simd.checksum, pair.scalar.checksum);
      assert.ok(pair.simd.elapsedMs > 0 && pair.scalar.elapsedMs > 0);
      assert.equal(pair.simd.iterations, b.iterations); assert.equal(pair.scalar.iterations, b.iterations);
    }
    assert.equal(b.scalarMedianMs, median(b.pairs.map((p) => p.scalar.elapsedMs)));
    assert.equal(b.simdMedianMs, median(b.pairs.map((p) => p.simd.elapsedMs)));
    assert.equal(b.scalarOverSimdRatio, b.scalarMedianMs / b.simdMedianMs);
    assert.match(b.scope, /not production Chromium end-to-end speed acceptance/);
  }
});
