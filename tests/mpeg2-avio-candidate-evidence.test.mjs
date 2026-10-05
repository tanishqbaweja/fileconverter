import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-avio64-protected-failure-2026-10-06.json", import.meta.url)));
test("Actual 64KiB candidate preserves small output bytes, audio and adverse cleanup", async () => {
  for (const [file, hash] of Object.entries(proof.reducerSources))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash);
  assert.equal(proof.run.databaseId, 37356848855); assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.manifest.allocatorDiagnostic, false);
  assert.equal(proof.manifest.avioInputBufferBytes, 65536); assert.equal(proof.manifest.avioOutputBufferBytes, 65536);
  assert.equal(proof.manifest.encoderAccessoryLifecycleSmoke.status, "passed");
  assert.deepEqual(proof.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.equal(proof.small.passedCases, 4); assert.equal(proof.small.outputsByteIdenticalToPriorCandidate, true);
  assert.deepEqual(proof.small.cases.map((row) => [row.frames, row.outputBytes, row.ssim]),
    [["48", 321692, 0.992146], ["96", 652521, 0.985963]]);
  for (const row of proof.small.cases) {
    assert.equal(row.outputCodec, "mpeg2video"); assert.equal(row.metrics.maxReadChunkBytes, 65536);
    assert.equal(row.metrics.maxWriteChunkBytes, 65536); assert.equal(row.metrics.peakPendingOperations, 1);
    row.outputFrameTimes.forEach((time, i) => assert.ok(Math.abs(time - row.sourceFrameTimes[i]) <= 0.001));
  }
  const decoded = proof.small.independent.filter((row) => row.kind === "independent-decoded-audio");
  assert.equal(decoded.length, 2);
  for (const row of decoded) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
  for (const row of proof.small.adverse) {
    assert.equal(row.status, "passed"); assert.deepEqual(row.partialBytes, []);
    assert.equal(row.metrics.queuedBytes, 0); assert.equal(row.metrics.pendingOperations, 0);
  }
  assert.equal(proof.small.adverse[1].beforeCancel.outputBytes, 232344);
  assert.equal(proof.small.adverse[1].metrics.outputBytes, 471427);
  assert.equal(proof.small.adverse[1].terminalState, "cancelled");
});
test("Requested AVIO saving and incomplete frame-buffer failure cannot certify fit or speed", () => {
  assert.equal(proof.requestedReserveReductionBytes, 393216); assert.equal(proof.measuredHeapSavingsBytes, null);
  assert.equal(proof.speedGainClaim, null); assert.equal(proof.small.sameInputSpeedAB, false);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.primaryMemoryAcceptance, false);
  assert.equal(proof.protected.source.bytes, 2958573265);
  assert.equal(proof.protected.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.protected.requestedRuns, 3); assert.equal(proof.protected.attemptedRuns, 1);
  assert.equal(proof.protected.completedConversions, 0); assert.equal(proof.protected.metrics.outputBytes, 0);
  assert.equal(proof.protected.failedRequestedHeapEndBytes, 33945192);
  assert.match(proof.protected.error, /av_buffer_allocz[\s\S]*avcodec_default_get_buffer2/);
  assert.equal(proof.protected.exactFailedPlaneOrCodecContext, null);
  assert.equal(proof.protected.actualEncoderCacheRetention, null);
  assert.equal(proof.protected.unchangedRetryUseful, false);
  const m = proof.memory;
  assert.equal(m.incrementalPrivateMiB, 188.87890625); assert.equal(m.validSamples, 16);
  assert.equal(m.unavailableSamples, 0); assert.equal(m.incompleteConversion, true); assert.equal(m.acceptance, false);
  assert.equal(m.nativePeak.privateBytes, m.nativePeak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  assert.equal(m.incrementalPrivateMiB,
    (Math.max(m.nativePeak.privateBytes, m.cimPeakPrivateBytes) - m.blankBaseline.privateBytes) / 1024 ** 2);
  assert.ok(m.nativePeak.processes.some((row) => row.type === "unknown"));
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged",
    "observerStopped", "sampledChromeRootStopped", "independentlyVerifiedSixAssetsRestored",
    "independentlyVerifiedAdaptersAndRuntimeAbsent", "independentlyVerifiedSmallFixturesAndRuntimeAbsent"])
    assert.equal(proof.cleanup[key], true);
  assert.equal(proof.cleanup.independentlyVerifiedFullObservedAndOwnedPidsAbsent, 22);
  assert.equal(proof.cleanup.independentlyVerifiedSmallObservedPidsAbsent, 21);
  assert.equal(proof.cleanup.hostedArtifactsRemaining, 0); assert.equal(proof.cleanup.sourceBundleDownloaded, false);
  assert.match(proof.next, /read-only allocator-diagnostic/); assert.match(proof.next, /Goal remains incomplete/);
});
