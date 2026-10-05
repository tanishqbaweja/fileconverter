import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-guarded-stack-protected-failure-2026-10-05.json", import.meta.url)));
test("Guarded private stack trial retains actual reserves and unchanged genuine small output fidelity", async () => {
  assert.equal(proof.run.databaseId, 37334670866); assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.run.headSha, "7a9a1f05fa381cfdce4b51b9e39478e44877b0b0");
  assert.equal(proof.manifest.allocatorDiagnostic, false);
  assert.equal(proof.manifest.nativeStackBytes, 262144); assert.equal(proof.manifest.asyncifyStackBytes, 262144);
  assert.equal(proof.manifest.stackOverflowCheck, 2); assert.equal(proof.manifest.compiledStackOverflowHandler, true);
  assert.equal(proof.manifest.sources["mpeg2-candidate.c"], "67d3b8299a9e695ea68f96fdcc51d3f5ba5a694547b3f8288e740990c5f7eac0");
  assert.deepEqual(proof.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  for (const [file, hash] of Object.entries(proof.reductionSources))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash, file);
  assert.equal(proof.small.passed, 4); assert.equal(proof.small.reserves.length, 4);
  for (const row of proof.small.reserves) {
    assert.ok(row.samples.length > 0 && row.samples.length <= 16);
    for (const sample of row.samples) assert.deepEqual(sample, {
      nativeStackBytes: 262144, asyncifyStackBytes: 262144, stackOverflowCheck: 2,
      scope: "reserved-not-high-water-not-acceptance",
    });
  }
  assert.deepEqual(proof.small.encoded.map((x) => x.outputSha256), [
    "d366abbe466cbd7a70ae7353efda456471c9b064402996a58fa1d2dd7589bf94",
    "6c0575388593dd8e789e8e7d5d8c188620e16d6957c768585e9abc5694b4fc32",
  ]);
  for (const row of proof.small.encoded) {
    assert.equal(row.outputCodec, "mpeg2video"); assert.ok(row.ssim >= 0.98);
    assert.equal(row.identicalToPreviousOutput, true); assert.equal(row.completeDecodedAudioHashesEqual, true);
    assert.equal(row.fullDecode, true); assert.equal(row.metrics.queuedBytes, 0);
    assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.peakPendingOperations, 1);
  }
  assert.equal(proof.small.presentationTimelines.length, 2); assert.equal(proof.small.audioTiming.length, 2);
  for (const row of proof.small.adverse) {
    assert.equal(row.status, "passed"); assert.deepEqual(row.partialBytes, []);
  }
});
test("Same original guarded-stack trial remains failed, all-process incomplete measurement and cleanup are honest", () => {
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.primaryMemoryAcceptance, false);
  assert.equal(proof.speedGainClaim, null); assert.equal(proof.source.bytes, 2958573265);
  assert.equal(proof.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.source.inputChanged, false); assert.equal(proof.source.width, 1920); assert.equal(proof.source.height, 804);
  const p = proof.protected, m = p.memory;
  assert.equal(p.requestedRuns, 3); assert.equal(p.attemptedRuns, 1); assert.equal(p.completedConversions, 0);
  assert.equal(p.metrics.inputBytes, 288321); assert.equal(p.metrics.outputBytes, 0);
  assert.equal(p.failedRequestedHeapEndBytes, 33902168); assert.equal(p.independentValidation, null);
  assert.match(p.error, /av_refstruct_pool_get/); assert.match(p.error, /alloc_frame/);
  assert.equal(p.exactPool, null); assert.equal(p.liveBytes, null); assert.equal(p.cachedBytes, null);
  assert.equal(m.incompleteConversion, true); assert.equal(m.acceptance, false);
  assert.equal(m.incrementalPrivateMiB, 187.6875); assert.equal(m.limitMiB, 250);
  assert.equal(m.validSamples, 16); assert.equal(m.unavailableSamples, 0);
  assert.equal(m.nativePeak.processes.reduce((sum, x) => sum + x.privateBytes, 0), m.nativePeak.privateBytes);
  assert.equal(m.incrementalPrivateMiB,
    (Math.max(m.cimPeakPrivateBytes, m.nativePeak.privateBytes) - m.blankBaseline.privateBytes) / 1024 ** 2);
  assert.ok(m.nativePeak.processes.some((x) => x.type === "unknown"));
  assert.ok(Object.values(p.cleanup).every((x) => x === true)); assert.deepEqual(p.forbiddenRequests, []);
  assert.equal(proof.cleanupAudit.independentlyVerifiedAllSmallAndProtectedObservedPidsAbsent, true);
  assert.equal(proof.cleanupAudit.independentlyVerifiedSixAssetsRestored, true);
  assert.equal(proof.cleanupAudit.independentlyVerifiedPrivateAdaptersAndRuntimeAbsent, true);
  assert.equal(proof.cleanupAudit.smallFixturesAndConvertedOutputsRemoved, true);
  assert.equal(proof.cleanupAudit.hostedArtifactsRemaining, 0);
  assert.equal(proof.cleanupAudit.sourceBundleDownloaded, false);
  assert.match(proof.next, /Goal remains incomplete/); assert.match(proof.next, /Do not repeat/);
});
