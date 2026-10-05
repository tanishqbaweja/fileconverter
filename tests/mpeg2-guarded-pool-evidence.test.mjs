import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { refstructSampleBytes } from "../scripts/lib/refstruct-sample-bytes.mjs";

const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-guarded-live-pool-measured-2026-10-05.json", import.meta.url)));
test("Changed guarded layout directly measures a still-live HEVC MV shortage, not a cache or old-layout guess", async () => {
  assert.equal(proof.run.databaseId, 37337524566); assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.manifest.allocatorDiagnostic, true);
  assert.equal(proof.manifest.nativeStackBytes, 262144); assert.equal(proof.manifest.asyncifyStackBytes, 262144);
  assert.equal(proof.manifest.refstructPoolDiagnosticSmoke.checkedTransitions, 9);
  assert.deepEqual(proof.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  for (const [file, hash] of Object.entries(proof.reductionSources))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash, file);
  const t = proof.telemetry, a = proof.allocation;
  assert.equal(t.orderedEvents.length, 191); assert.equal(t.capturedHeapEvents, 66); assert.equal(t.capturedPoolEvents, 125);
  assert.equal(t.evicted, 0); assert.equal(t.incompletePoolSamples, 0); assert.equal(t.capExhausted, false);
  for (const kind of ["heap", "pool"])
    t.orderedEvents.filter((x) => x[0] === kind).forEach((x, i) => assert.equal(x[1], i + 1));
  assert.deepEqual(t.orderedEvents.at(-2).slice(0, 7), ["heap", 66, 18, 173, false, 1920, 808]);
  assert.deepEqual(t.orderedEvents.at(-1).slice(0, 9), ["pool", 125, 19, 3223616, true, 1163520, 1163536, 5, 0]);
  assert.equal(a.pool, "HEVC tab_mvf_pool"); assert.equal(a.preAbortSnapshot.freeDynamicBytes, 295380);
  assert.equal(a.preAbortSnapshot.unclaimedHeapBytes, 814424);
  assert.equal(a.availableFreePlusUnclaimedUpperBoundBytes, 1109804);
  assert.equal(a.minimumShortfallIgnoringFragmentationAndOverheadBytes, 53732);
  assert.equal(a.minimumShortfallIgnoringFragmentationAndOverheadBytes,
    a.preAbortSnapshot.entryRequestedAllocationBytes - a.availableFreePlusUnclaimedUpperBoundBytes);
  assert.deepEqual(refstructSampleBytes(a.preAbortSnapshot), {
    available: true, requestedLiveBytes: 5817680, requestedCachedBytes: 0,
    requestedTotalBackingBytes: 5817680, allocatorOverheadBytes: null,
  });
  assert.equal(a.motionVectorUncachingUsefulAtMeasuredFailure, false); assert.equal(a.unchangedRetryUseful, false);
  assert.equal(a.allocatorOverheadBytes, null); assert.equal(a.totalConcurrentOtherPoolsBytes, null);
});
test("Guarded-layout pool diagnostic retains incomplete original-source, complete-tree and cleanup evidence without acceptance", () => {
  assert.equal(proof.source.bytes, 2958573265);
  assert.equal(proof.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.source.inputChanged, false); assert.equal(proof.attemptedRuns, 1);
  assert.equal(proof.completedConversions, 0); assert.equal(proof.metrics.outputBytes, 0);
  assert.equal(proof.independentValidation, null); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.speedGainClaim, null);
  const m = proof.memory;
  assert.equal(m.incrementalPrivateMiB, 200.9296875); assert.equal(m.validSamples, 34); assert.equal(m.unavailableSamples, 0);
  assert.equal(m.incompleteConversion, true); assert.equal(m.acceptance, false); assert.equal(m.limitMiB, 250);
  assert.equal(m.nativePeak.processes.reduce((sum, p) => sum + p.privateBytes, 0), m.nativePeak.privateBytes);
  assert.equal(m.incrementalPrivateMiB, (Math.max(m.cimPeakPrivateBytes, m.nativePeak.privateBytes) - m.blankBaseline.privateBytes) / 1024 ** 2);
  assert.ok(m.nativePeak.processes.some((p) => p.type === "unknown"));
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped",
    "sampledChromeRootStopped", "independentlyVerifiedAllObservedPidsAbsent", "independentlyVerifiedSixAssetsRestored",
    "independentlyVerifiedAdaptersAndRuntimeAbsent"]) assert.equal(proof.cleanup[key], true);
  assert.equal(proof.cleanup.hostedArtifactsRemaining, 0); assert.equal(proof.cleanup.sourceBundleDownloaded, false);
  assert.deepEqual(proof.forbiddenRequests, []); assert.match(proof.next, /Goal remains incomplete/);
});
