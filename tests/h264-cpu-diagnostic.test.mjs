import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { summarizeCpuProfile } from "../scripts/lib/cpu-profile-summary.mjs";
const e = JSON.parse(await readFile(new URL("../evidence/h264-cpu-diagnostic-2026-10-04.json", import.meta.url)));
test("real worker CPU evidence distinguishes a partial sampled hotspot from optimization acceptance", () => {
  const r = e.report;
  assert.equal(r.status, "passed-instrumented-cpu-diagnostic-only");
  assert.equal(r.requestedRunCount, 1); assert.equal(r.publicAcceptance, false);
  assert.equal(e.publicAcceptance, false);
  const profile = e.rawCpuProfile.profile;
  assert.equal(createHash("sha256").update(JSON.stringify(profile)).digest("hex"), e.rawCpuProfile.sha256);
  assert.deepEqual(summarizeCpuProfile(profile), r.cpuDiagnostic.summary);
  assert.equal(profile.samples.length, 9460);
  assert.equal(r.cpuDiagnostic.requestedWindowMs, 15000);
  assert.equal(r.cpuDiagnostic.observedWindowMs, 15037);
  const categories = Object.fromEntries(r.cpuDiagnostic.summary.categories.map((row) => [row.category, row.fractionOfSampledWindow]));
  assert.ok(categories["openh264-encoder-stack"] > 0.7);
  assert.ok(categories["ffmpeg-decoder-stack"] > 0.1);
  assert.ok(categories["io-bridge-or-avio"] < 0.05);
  assert.match(r.cpuDiagnostic.summary.topSelf[0].functionName, /VAACalcSadBgd_c/);
  assert.match(r.cpuDiagnostic.scope, /Partial/);
});
test("CPU diagnosis retains real output fidelity, exact process-tree memory and source/cleanup provenance", async () => {
  const r = e.report, run = r.runs[0], validation = run.independentValidation;
  assert.equal(r.source.bytes, 105000218);
  assert.equal(validation.outputSha256, "a77bd1fb023a1a3072966d74f173c0c6010eccea689e67b346e29baca3c3a636");
  assert.equal(validation.outputFrameTimes.length, 1800);
  assert.equal(validation.maximumFrameTimeErrorSeconds, 0);
  assert.deepEqual(validation.audioPacketHashes, r.source.audioPacketHashes);
  assert.ok(validation.ordinalSsim >= 0.98);
  assert.equal(run.incrementalPrivateMiB, (run.peakPrivateBytes - r.blankBaseline.privateBytes) / 1048576);
  assert.ok(run.incrementalPrivateMiB <= 250);
  assert.equal(r.cleanup.repositoryLocalFixtureOutputsProfileAndTempRemoved, true);
  assert.equal(r.cleanup.generatedDistRestored, true);
  assert.deepEqual(r.forbiddenRequests, []);
  for (const [file, hash] of Object.entries(e.currentSources)) {
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash, file);
  }
});
