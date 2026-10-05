import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-decoder-module-protected-failure-2026-10-06.json", import.meta.url)));
test("Executed decoder-family module pins actual artifacts and retains wide availability without footprint/speed overclaims", async () => {
  for (const [file, hash] of Object.entries(proof.sources))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash);
  assert.equal(proof.run.databaseId, 37367996146); assert.equal(proof.run.jobId, 111957771738);
  assert.equal(proof.run.conclusion, "success"); assert.equal(proof.run.buildSeconds, 279);
  assert.equal(proof.run.headSha, "41e0384b1ad815a30487946b6d70fa587dbbe08b");
  assert.equal(Object.keys(proof.manifest.sources).length, 19);
  assert.equal(Object.keys(proof.manifest.artifacts).length, 3);
  assert.equal(proof.manifest.decoderSet, "hevc-mpeg4");
  assert.deepEqual(proof.manifest.enabledDecoders, ["h263", "hevc", "mpeg4"]);
  assert.equal(proof.manifest.nativeAllocator, "dlmalloc");
  assert.equal(proof.manifest.allocatorLifecycleSmokeAllocator, "dlmalloc");
  assert.equal(proof.manifest.allocatorDiagnostic, false);
  assert.deepEqual(proof.staticLayout.rows.map((row) =>
    [row.fileBytes, row.codeSectionBytes, row.passivePayloadBytes, row.stackEnd, row.stackBase]),
  [[7228748, 6695682, 400158, 1979984, 2242128], [4856513, 4435283, 336065, 1822912, 2085056]]);
  for (const row of proof.staticLayout.rows) {
    assert.deepEqual(row.actualMemory, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
    assert.equal(row.stackReserveBytes, 262144); assert.equal(row.importCallbacks, 0);
    assert.equal(row.heapBase, null); assert.equal(row.runtimeHeapSavingsBytes, null);
    assert.equal(row.primaryMemoryAcceptance, false);
  }
  assert.equal(proof.staticLayout.rows[0].enabledDecoders.length, 9);
  assert.equal(proof.boundaryReductionBytes, 157072);
  assert.match(proof.staticLimitations, /not measured runtime heap savings/);
  assert.equal(proof.speedGainClaim, null); assert.equal(proof.measuredHeapSavingsBytes, null);
  assert.equal(proof.small.sameInputSpeedAB, false);
});
test("Small genuine encode successes and adverse cleanup do not certify the failed original-source profile", () => {
  assert.equal(proof.small.passedCases, 4); assert.equal(proof.small.suiteSeconds, 19.7);
  assert.equal(proof.small.outputsByteIdenticalToWideCandidate, true);
  assert.deepEqual(proof.small.cases.map((row) => [row.sourceCodec, row.frames, row.outputBytes, row.ssim]),
    [["mpeg4", "48", 321692, 0.992146], ["hevc", "96", 652521, 0.985963]]);
  for (const row of proof.small.cases) {
    assert.equal(row.outputCodec, "mpeg2video"); assert.equal(row.metrics.peakWasmMemoryBytes, 33554432);
    for (const key of ["maxReadChunkBytes", "maxWriteChunkBytes", "peakQueuedBytes"]) assert.equal(row.metrics[key], 65536);
    assert.equal(row.metrics.peakPendingOperations, 1);
    assert.equal(row.sourceFrameTimes.length, row.outputFrameTimes.length);
    row.outputFrameTimes.forEach((value, i) => assert.ok(Math.abs(value - row.sourceFrameTimes[i]) <= 0.001));
  }
  assert.equal(proof.small.decodedAudio.length, 2);
  for (const row of proof.small.decodedAudio) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
  for (const row of proof.small.adverse) {
    assert.equal(row.status, "passed"); assert.deepEqual(row.partialBytes, []);
    assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.queuedBytes, 0);
  }
  assert.equal(proof.small.adverse[1].beforeCancel.outputBytes, 232344);
  assert.equal(proof.small.adverse[1].metrics.outputBytes, 471427);
  assert.equal(proof.small.adverse[1].terminalState, "cancelled");
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.primaryMemoryAcceptance, false);
  const p = proof.protected, m = proof.memory;
  assert.equal(p.source.bytes, 2958573265);
  assert.equal(p.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(p.requestedRuns, 3); assert.equal(p.attemptedRuns, 1); assert.equal(p.completedConversions, 0);
  assert.equal(p.failedRequestedHeapEndBytes, 33783808);
  assert.equal(p.metrics.inputBytes, 222785); assert.equal(p.metrics.outputBytes, 0);
  assert.equal(p.exactFailedPlaneOrCodecContext, null); assert.equal(p.actualEncoderCacheRetention, null);
  assert.equal(p.contiguousFreeBlockCapacity, null); assert.equal(p.independentValidation, null);
  assert.equal(p.unchangedRetryUseful, false);
  assert.match(p.error, /dlposix_memalign[\s\S]*av_buffer_allocz[\s\S]*avcodec_default_get_buffer2/);
  assert.equal(m.incrementalPrivateMiB, 186.0390625); assert.equal(m.validSamples, 11);
  assert.equal(m.unavailableSamples, 0); assert.equal(m.incompleteConversion, true); assert.equal(m.acceptance, false);
  assert.equal(m.nativePeak.privateBytes, m.nativePeak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  assert.equal(m.incrementalPrivateMiB,
    (Math.max(m.nativePeak.privateBytes, m.cimPeakPrivateBytes) - m.blankBaseline.privateBytes) / 1024 ** 2);
  assert.ok(m.nativePeak.processes.some((row) => row.type === "unknown"));
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged",
    "observerStopped", "sampledChromeRootStopped", "independentlyVerifiedSixAssetsRestored",
    "independentlyVerifiedAdaptersAndRuntimeAbsent", "independentlyVerifiedSmallFixturesAndRuntimeAbsent"])
    assert.equal(proof.cleanup[key], true);
  assert.equal(proof.cleanup.independentlyVerifiedFullObservedAndOwnedPidsAbsent, 21);
  assert.equal(proof.cleanup.independentlyVerifiedSmallObservedPidsAbsent, 22);
  assert.equal(proof.cleanup.hostedArtifactsRemaining, 0);
  assert.deepEqual(proof.cleanup.deletedHostedArtifactIds, [11368414042, 11368384228]);
  assert.equal(proof.cleanup.sourceBundleDownloaded, false);
  assert.match(proof.next, /Identify the exact failed allocation\/codec context/);
  assert.match(proof.next, /Full goal remains incomplete/);
});
