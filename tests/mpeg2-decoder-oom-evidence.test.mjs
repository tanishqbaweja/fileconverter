import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const evidence = JSON.parse(await readFile(new URL(
  "../evidence/mpeg2-metadata-passed-decoder-oom-2026-10-05.json", import.meta.url), "utf8"));

test("MPEG2 metadata fix passes exact small fields without certifying failed protected output", () => {
  assert.equal(evidence.publicAcceptance, false);
  assert.equal(evidence.primaryMemoryAcceptance, false);
  assert.equal(evidence.speedGainClaim, null);
  assert.equal(evidence.manifest.allocatorDiagnostic, false);
  assert.equal(evidence.manifest.maximumWasmMemoryBytes, 33554432);
  assert.equal(evidence.small.suite.passed, 3);
  assert.equal(evidence.small.suite.failed, 0);
  const normalize = (tags) => Object.fromEntries(Object.entries(tags).map(([k, v]) => [k.toLowerCase(), v]));
  const before = normalize(evidence.small.sourceContainerTags);
  const after = normalize(evidence.small.outputContainerTags);
  assert.equal(before.encoder, "Lavf");
  for (const [key, value] of Object.entries(before)) assert.equal(after[key], value, key);
  const encoded = evidence.small.genuineEncode;
  assert.equal(encoded.frames, "48");
  assert.equal(encoded.outputCodec, "mpeg2video");
  assert.ok(encoded.ssim >= 0.98);
  assert.equal(encoded.sourceFrameTimes.length, encoded.outputFrameTimes.length);
  encoded.sourceFrameTimes.forEach((t, i) => assert.ok(Math.abs(t - encoded.outputFrameTimes[i]) <= 0.001));
  assert.equal(evidence.small.art.inputArt.width, evidence.small.art.outputArt.width);
  assert.equal(evidence.small.art.inputArt.height, evidence.small.art.outputArt.height);
  for (const row of evidence.small.safety) {
    assert.equal(row.status, "passed");
    assert.equal(row.metrics.queuedBytes, 0);
    assert.equal(row.metrics.pendingOperations, 0);
    assert.deepEqual(row.partialBytes, []);
  }
});

test("MPEG2 remaining allocation moves to HEVC; original input, full peaks and cleanup stay explicit", () => {
  assert.equal(evidence.protectedSource.bytes, 2958573265);
  assert.equal(evidence.protectedSource.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(evidence.protectedSource.width, 1920);
  assert.equal(evidence.protectedSource.height, 804);
  assert.equal(evidence.fullRetry.diagnosticOnly, false);
  assert.equal(evidence.fullRetry.status, "failed");
  assert.equal(evidence.stackDiagnostic.diagnosticOnly, true);
  assert.equal(evidence.stackDiagnostic.requestedRuns, 1);
  assert.equal(evidence.stackDiagnostic.callerChanged, true);
  assert.match(evidence.stackDiagnostic.nativeFailureChunks.join(""), /alloc_frame/);
  assert.match(evidence.stackDiagnostic.nativeFailureChunks.join(""), /hevc_receive_frame/);
  for (const row of [evidence.fullRetry, evidence.stackDiagnostic]) {
    assert.equal(row.metrics.inputBytes, 353857);
    assert.equal(row.metrics.outputBytes, 0);
    assert.equal(row.metrics.wasmMemoryBytes, 33554432);
    const peak = row.nativePeaks.peak;
    assert.equal(peak.processes.reduce((sum, p) => sum + p.privateBytes, 0), peak.privateBytes);
    assert.equal((row.peakPrivateBytes - row.blankBaseline.privateBytes) / 1024 ** 2, row.incrementalPrivateMiB);
    assert.ok(Object.values(row.cleanup).every((value) => value === true));
    assert.deepEqual(row.forbiddenRequests, []);
  }
  assert.equal(evidence.cleanup.remainingHostedArtifacts, 0);
  assert.equal(evidence.cleanup.obsoleteStaticToolRemoval.removed, false);
  assert.match(evidence.cleanup.obsoleteStaticToolRemoval.reason, /policy/);
});
