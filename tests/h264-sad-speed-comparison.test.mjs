import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareH264SadSpeed } from "../scripts/lib/h264-sad-speed-comparison.mjs";

const historical = JSON.parse(await readFile(new URL("../evidence/h264-vaa-simd-comparison-2026-10-04.json", import.meta.url))).reports[0].report;
const proof = JSON.parse(await readFile(new URL("../evidence/openh264-sad-arithmetic-2026-10-04.json", import.meta.url)));
function pair() {
  const baseline = structuredClone(historical), candidate = structuredClone(baseline);
  candidate.asBuiltManifest.openh264SadSimd = true;
  candidate.asBuiltManifest.artifacts["within-h264.wasm"] = "synthetic-different-binary";
  candidate.asBuiltManifest.openh264SadSimdProvenance = {
    helperSha256: proof.report.sourceHashes["media/ffmpeg/openh264-sad-simd.h"],
    upstreamSourceSha256: proof.report.upstream.sha256, headSha: proof.run.headSha,
  };
  for (const run of candidate.runs) run.state.metrics.elapsedMs *= 0.8;
  return [baseline, candidate];
}
test("SAD comparison requires true output, recomputed whole-tree peaks and proven isolated helper", () => {
  const [baseline, candidate] = pair();
  assert.equal(compareH264SadSpeed(baseline, candidate, proof).privateOptimizationCandidatePassed, true);
  candidate.runs[0].incrementalPrivateMiB = 0;
  assert.equal(compareH264SadSpeed(baseline, candidate, proof).privateOptimizationCandidatePassed, false);
  candidate.asBuiltManifest.openh264SadSimdProvenance.helperSha256 = "unproven";
  assert.throws(() => compareH264SadSpeed(baseline, candidate, proof));
});
test("SAD comparison refuses changed codec settings, VAA, profiling, frame corruption and incomplete repeats", () => {
  const [baseline, candidate] = pair();
  candidate.asBuiltManifest.openh264VaaSimd = true;
  assert.throws(() => compareH264SadSpeed(baseline, candidate, proof), /rejected VAA/);
  candidate.asBuiltManifest.openh264VaaSimd = false; candidate.cpuEnabled = true;
  assert.throws(() => compareH264SadSpeed(baseline, candidate, proof), /Profiler/);
  candidate.cpuEnabled = false; candidate.asBuiltManifest.codecThreads = 2;
  assert.throws(() => compareH264SadSpeed(baseline, candidate, proof), /Same settings/);
  candidate.asBuiltManifest.codecThreads = 1; candidate.runs[0].independentValidation.outputFrameTimes[0] += 1;
  assert.equal(compareH264SadSpeed(baseline, candidate, proof).measuredSpeedupFraction, null);
  const [a, b] = pair(); b.runs.pop();
  assert.equal(compareH264SadSpeed(a, b, proof).privateOptimizationCandidatePassed, false);
});
test("SAD comparison cannot accept zero/unavailable process samples or synthetic throughput alone", () => {
  const [baseline, candidate] = pair();
  candidate.samples.forEach((sample) => { sample.privateBytes = 0; });
  for (const run of candidate.runs) { run.peakPrivateBytes = 0; run.incrementalPrivateMiB = -candidate.blankBaseline.privateBytes / 1048576; }
  const result = compareH264SadSpeed(baseline, candidate, proof);
  assert.equal(result.allPrivateGatesPassed, false);
  assert.equal(result.privateOptimizationCandidatePassed, false);
  assert.equal(result.publicAcceptance, false);
  assert.ok(result.after.jobs.every((job) => job.recalculatedIncrementalPrivateMiB === null));
});
test("native allocator instrumentation cannot pass as an uninstrumented speed trial", () => {
  const [baseline, candidate] = pair();
  candidate.asBuiltManifest.allocatorDiagnostic = true;
  assert.throws(() => compareH264SadSpeed(baseline, candidate, proof), /Allocator diagnostics/);
});
