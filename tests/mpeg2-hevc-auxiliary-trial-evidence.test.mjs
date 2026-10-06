import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-hevc-auxiliary-trial-failure-2026-10-06.json", import.meta.url)));
test("Actual final-reference HEVC trial compiled its exact selector but failed the original normal gate", async () => {
  for (const [file, hash] of Object.entries(proof.sources))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash);
  assert.equal(proof.run.databaseId, 37397131884); assert.equal(proof.run.jobId, 112055657628);
  assert.equal(proof.run.headSha, "cb9ec7654e6c42985a5155ec5c5d97fd803966b0");
  assert.equal(proof.run.conclusion, "success"); assert.equal(proof.run.buildSeconds, 194);
  assert.equal(Object.keys(proof.manifest.sources).length, 27); assert.equal(Object.keys(proof.manifest.artifacts).length, 3);
  assert.equal(proof.manifest.hevcAuxiliarySelectorSmoke.checkedConfigurations, 60);
  assert.equal(proof.manifest.encoderAccessoryLifecycleSmoke.onlyFinalReferenceReleased, true);
  assert.equal(proof.manifest.hevcDecoderPatchedSourceSha256, "0c91a1622add9eaf483f6fdcf3f9eddb59d5f4540d8a526b97d60b7889de67c5");
  assert.equal(proof.manifest.nativeAllocator, "dlmalloc");
  assert.equal(proof.manifest.frameAllocationDiagnostic, false); assert.equal(proof.manifest.allocatorDiagnostic, false);
  assert.equal(proof.diagnosticOnly, false); assert.equal(proof.protected.requestedRuns, 3);
  assert.equal(proof.protected.attemptedRuns, 1); assert.equal(proof.protected.completedConversions, 0);
  assert.equal(proof.protected.source.bytes, 2958573265); assert.equal(proof.protected.source.width, 1920);
  assert.equal(proof.protected.source.height, 804); assert.equal(proof.protected.source.inputChanged, false);
  assert.equal(proof.protected.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.protected.metrics.inputBytes, 222785); assert.equal(proof.protected.metrics.outputBytes, 0);
  assert.equal(proof.protected.failedRequestedHeapEndBytes, 34426880);
  assert.match(proof.protected.error, /av_refstruct_pool_get/); assert.match(proof.protected.error, /alloc_frame/);
  for (const field of ["exactFailedPool", "simultaneousLiveEntries", "simultaneousCachedEntries",
    "inactiveBackingBytesAtFailure", "contiguousFreeBlockCapacity", "measuredRuntimeSavingsBytes"])
    assert.equal(proof.allocation[field], null);
  assert.equal(proof.allocation.safeLiveReferenceRemoval, false);
  assert.equal(proof.protected.unchangedRetryUseful, false); assert.equal(proof.protected.independentValidation, null);
});
test("Small fidelity passes, incomplete full-tree memory and verified cleanup never become speed or acceptance", () => {
  assert.equal(proof.small.passedCases, 4); assert.equal(proof.small.outputsByteIdenticalToNormalCandidate, true);
  assert.equal(proof.small.sameInputSpeedAB, false);
  assert.deepEqual(proof.small.cases.map((row) => [row.sourceCodec, row.frames, row.outputBytes, row.ssim]),
    [["mpeg4", "48", 321692, 0.992146], ["hevc", "96", 652521, 0.985963]]);
  for (const row of proof.small.adverse) {
    assert.deepEqual(row.partialBytes, []); assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.queuedBytes, 0);
  }
  assert.equal(proof.small.adverse[1].beforeCancel.outputBytes, 232344);
  assert.equal(proof.small.adverse[1].metrics.outputBytes, 599048);
  const memory = proof.memory;
  assert.equal(memory.incrementalPrivateMiB, 188.96875); assert.equal(memory.validSamples, 26);
  assert.equal(memory.unavailableSamples, 0); assert.equal(memory.incompleteConversion, true);
  assert.equal(memory.nativePeak.privateBytes, memory.nativePeak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  assert.equal(memory.incrementalPrivateMiB,
    (Math.max(memory.nativePeak.privateBytes, memory.cimPeakPrivateBytes) - memory.blankBaseline.privateBytes) / 1024 ** 2);
  assert.equal(memory.acceptance, false); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.speedGainClaim, null);
  assert.equal(proof.cleanup.independentlyVerifiedFullObservedAndOwnedPidsAbsent, 19);
  assert.equal(proof.cleanup.independentlyVerifiedSmallObservedPidsAbsent, 21);
  assert.equal(proof.cleanup.independentlyVerifiedSixAssetsRestored, true);
  assert.equal(proof.cleanup.hostedArtifactsRemaining, 0); assert.equal(proof.cleanup.sourceBundleDownloaded, false);
  assert.equal(proof.cleanup.unrelatedProcessesKilled, false);
  assert.match(proof.next, /No unchanged normal retry/); assert.match(proof.next, /Full goal remains incomplete/);
});
