import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export const protectedRepeatReference = Object.freeze({
  file: "evidence/2026-11-08T13-27-29-790Z-mkv-exact-aac-protected.json",
  sha256: "77dcd5260b5c7ee17699f05f24878820ef53b20f82de9847c73ca6b9630c2286",
});

// ZIP identity can change on an exact rebuild, never the actual tool/source
// hashes, compiler recipe, ABI or declared Wasm bounds. Archive authentication
// and real unpacked-byte verification are independently required by the loader.
export function assertSameMkvNativeBuild(before, after) {
  for (const key of ["head", "runId", "build", "abi"]) assert.deepEqual(after[key], before[key], `Exact native build differs: ${key}`);
}

export function readProtectedRepeatReference(bytes, tools) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), protectedRepeatReference.sha256);
  const report = JSON.parse(bytes), [arm] = report.arms, [row] = arm.cases;
  assert.equal(report.status, "passed-first-protected-exact-aac-direct-reuse-not-public-acceptance");
  assert.equal(report.originalMediaSelected, true);
  assert.deepEqual(report.originalBefore, report.originalAfter);
  assertSameMkvNativeBuild(report.candidateBuild, tools);
  const v = row.validation;
  assert.equal(v.video.packets, 296160); assert.equal(v.aac.packets, 289221);
  assert.ok(v.video.packetBytesIdentical && v.aac.packetBytesIdentical);
  assert.equal(v.video.maximumPtsDeltaUs, 0); assert.equal(v.video.maximumDtsDeltaUs, 0);
  assert.ok(v.aac.maximumPtsErrorSeconds <= 0.001 && v.aac.maximumDtsErrorSeconds <= 0.001);
  assert.equal(v.aac.initialSkipSamples, 5058);
  assert.equal(v.aac.sourcePcm, v.aac.outputPcm);
  assert.ok(v.structure.subtitleDisclosed && v.structure.artworkDisclosed);
  assert.ok(row.outputRemoved && arm.ownedRuntimeRemoved && arm.serverCleanup.ownedRootAbsent && report.toolDownloadRemoved);
  assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent");
  return { ...protectedRepeatReference, outputBytes: row.metrics.outputBytes, outputSha256: v.outputSha256,
    fullVideoDecode: v.fullVideoDecode, priorBrowserVersion: arm.browser.version };
}

export function summarizeProtectedWindow(samples, window, blankBytes) {
  assert.ok(Number.isFinite(window.start) && Number.isFinite(window.end) && window.end >= window.start);
  assert.ok(Number.isSafeInteger(blankBytes) && blankBytes > 0);
  const selected = samples.filter(s => Date.parse(s.timestamp) >= window.start && Date.parse(s.timestamp) <= window.end);
  const valid = selected.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
  assert.ok(valid.length > 0, "Protected job has no valid whole-tree samples");
  for (const row of valid) assert.equal(row.processes.reduce((sum, p) => sum + p.privateBytes, 0), row.privateBytes);
  const peak = valid.reduce((a, b) => a.privateBytes >= b.privateBytes ? a : b);
  const incrementalPrivateMiB = (peak.privateBytes - blankBytes) / 1048576;
  assert.ok(incrementalPrivateMiB <= 250, "Protected job exceeded unchanged 250 MiB gate");
  return { ...window, validSamples: valid.length, unavailableSamples: selected.length - valid.length, peak, incrementalPrivateMiB };
}
