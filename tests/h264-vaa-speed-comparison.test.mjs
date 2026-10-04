import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareH264VaaSpeed } from "../scripts/lib/h264-vaa-speed-comparison.mjs";
const historical = JSON.parse(await readFile(new URL("../evidence/h264-library-lto-comparison-2026-10-04.json", import.meta.url))).reports[0].report;
const proof = JSON.parse(await readFile(new URL("../evidence/openh264-vaa-arithmetic-2026-10-04.json", import.meta.url)));
function pair() {
  const baseline = structuredClone(historical);
  baseline.cpuEnabled = false; baseline.requestedRunCount = 3;
  const candidate = structuredClone(baseline);
  candidate.asBuiltManifest.openh264VaaSimd = true;
  candidate.asBuiltManifest.artifacts["within-h264.wasm"] = "different-test-binary";
  candidate.asBuiltManifest.openh264VaaSimdProvenance = {
    helperSha256: proof.attempts[1].report.sourceHashes["media/ffmpeg/openh264-vaa-simd.h"],
    upstreamSourceSha256: proof.attempts[1].report.upstream.sha256,
  };
  for (const run of candidate.runs) run.state.metrics.elapsedMs *= 0.8;
  return [baseline, candidate];
}
test("VAA A/B recomputes whole-tree peaks and requires identical real output and proven helper", () => {
  const [baseline, candidate] = pair();
  assert.equal(compareH264VaaSpeed(baseline, candidate, proof).privateOptimizationCandidatePassed, true);
  candidate.runs[0].incrementalPrivateMiB = 0;
  assert.equal(compareH264VaaSpeed(baseline, candidate, proof).privateOptimizationCandidatePassed, false);
  candidate.asBuiltManifest.openh264VaaSimdProvenance.helperSha256 = "unproven";
  assert.throws(() => compareH264VaaSpeed(baseline, candidate, proof));
});
test("VAA A/B rejects profiling, different settings, missing samples, bad frame times and fewer jobs", () => {
  const [baseline, candidate] = pair();
  candidate.cpuEnabled = true;
  assert.throws(() => compareH264VaaSpeed(baseline, candidate, proof), /Profiler must be disabled/);
  candidate.cpuEnabled = false; candidate.asBuiltManifest.codecThreads = 2;
  assert.throws(() => compareH264VaaSpeed(baseline, candidate, proof), /Same settings/);
  candidate.asBuiltManifest.codecThreads = 1; candidate.samples = [];
  assert.equal(compareH264VaaSpeed(baseline, candidate, proof).privateOptimizationCandidatePassed, false);
  candidate.runs[0].independentValidation.outputFrameTimes[0] += 1;
  assert.equal(compareH264VaaSpeed(baseline, candidate, proof).measuredSpeedupFraction, null);
  const [freshBaseline, freshCandidate] = pair(); freshCandidate.runs.pop();
  assert.equal(compareH264VaaSpeed(freshBaseline, freshCandidate, proof).privateOptimizationCandidatePassed, false);
});
test("VAA comparison cannot turn zero-valued unavailable process samples into a memory pass", () => {
  const [baseline, candidate] = pair();
  for (const sample of candidate.samples) sample.privateBytes = 0;
  for (const run of candidate.runs) {
    run.peakPrivateBytes = 0;
    run.incrementalPrivateMiB = -candidate.blankBaseline.privateBytes / 1024 ** 2;
  }
  const result = compareH264VaaSpeed(baseline, candidate, proof);
  assert.equal(result.allPrivateGatesPassed, false);
  assert.ok(result.after.jobs.every((job) => job.recalculatedIncrementalPrivateMiB === null));
});
