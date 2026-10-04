import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compareH264SadSpeed } from "../scripts/lib/h264-sad-speed-comparison.mjs";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const evidence = JSON.parse(await read("evidence/h264-sad-simd-comparison-2026-10-04.json"));
const proof = JSON.parse(await read("evidence/openh264-sad-arithmetic-2026-10-04.json"));
test("actual SAD comparison preserves its exact reports, private decision and executed-build identity", () => {
  assert.equal(evidence.build.status, "completed"); assert.equal(evidence.build.conclusion, "success");
  assert.equal(evidence.build.headSha, "5084bd6831e648a0227193b126329ea1d70d1ee6");
  assert.equal(evidence.publicAcceptance, false);
  assert.equal(evidence.build.sourceBundleDownloaded, false); assert.equal(evidence.build.remainingRemoteArtifacts, 0);
  const [baseline, candidate] = evidence.reports;
  for (const item of evidence.reports) assert.equal(sha(`${JSON.stringify(item.report, null, 2)}\n`), item.sha256);
  assert.deepEqual(compareH264SadSpeed(baseline.report, candidate.report, proof), evidence.comparison);
  assert.equal(candidate.report.asBuiltManifest.openh264SadSimd, true);
  assert.equal(candidate.report.asBuiltManifest.openh264VaaSimd, false);
  assert.equal(candidate.report.asBuiltManifest.libraryLinkTimeOptimization, false);
  assert.equal(candidate.report.asBuiltManifest.artifacts["within-h264.wasm"], "ce022f84f65a4dbf1e379a500d70581ba1878502cf7a30fb6935104b8fda1cc1");
  assert.equal(evidence.comparison.publicAcceptance, false);
  assert.equal(evidence.status, evidence.comparison.privateOptimizationCandidatePassed ? "private-720p-sad-simd-speed-pass-not-public" : "sad-simd-not-accepted");
});
test("SAD evidence binds current comparison sources and bounded retained-tool cleanup without publishing support", async () => {
  for (const [file, expected] of Object.entries(evidence.currentSources)) assert.equal(sha(await read(file)), expected, file);
  assert.equal(evidence.cleanup.hostedArtifactsRemaining, 0);
  assert.equal(evidence.cleanup.convertedMediaBytesInWork, 0);
  assert.equal(evidence.cleanup.staticTools.length, 5);
  assert.ok(evidence.cleanup.staticTools.some((entry) => entry.path === "work/h264-sad-candidate-output" && entry.bytes === 8302846));
  assert.equal(evidence.cleanup.retainedStaticToolBytes, evidence.cleanup.staticTools.reduce((sum, entry) => sum + entry.bytes, 0));
  assert.equal(Object.keys(evidence.cleanup.distHashes).length, 4);
  assert.ok(evidence.remaining.includes("Multi-gigabyte scaling"));
  assert.ok(evidence.remaining.includes("Registry/UI release integration"));
});
