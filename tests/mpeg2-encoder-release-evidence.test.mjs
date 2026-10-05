import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { mpeg2EncoderReleaseBytes } from "../scripts/lib/mpeg2-encoder-release-bytes.mjs";

const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-encoder-release-measured-2026-10-05.json", import.meta.url)));
test("Actual encoder boundary separates inactive accessory backing from required live references", async () => {
  assert.equal(proof.run.databaseId, 37340665849); assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.rawReport.bytes, 481335);
  for (const [file, hash] of Object.entries(proof.reductionSources))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash, file);
  const e = proof.encoderRelease;
  assert.equal(e.groups.length, 5);
  assert.deepEqual(e.groups.map(mpeg2EncoderReleaseBytes), e.reducedGroups);
  assert.deepEqual(e.reducedGroups.map((x) => x.requestedLiveBytes), [278222, 556444, 556444, 556444, 556444]);
  assert.deepEqual(e.reducedGroups.map((x) => x.requestedCachedBytes), [0, 0, 278222, 278222, 278222]);
  assert.equal(e.lastRequestedCachedBytes, 6430 + 25672 + 2 * 98360 + 2 * 24700);
  assert.equal(e.liveObjectsSafeToRelease, false); assert.equal(e.allocatorOverheadBytes, null);
  assert.equal(e.groups[0].pools[0].configured, false);
  assert.equal(e.reducedGroups[0].pools[0].requestedCachedBytes, null);
  assert.equal(e.lastGroupIndex, 188); assert.equal(e.followingOrderedEvents.length, 7);
  assert.equal(e.followingEncoderPoolGetObserved, false);
  const ids = new Set(e.groups.at(-1).pools.filter((x) => x.configured).map((x) => x.poolIdentity));
  assert.ok(!e.followingOrderedEvents.some((x) => x.kind === "refstruct-pool" && ids.has(x.poolIdentity)));
  const t = proof.telemetry;
  assert.equal(t.orderedEvents.length, 196); assert.equal(t.evicted, 0);
  assert.equal(t.capturedHeapEvents, 66); assert.equal(t.capturedPoolEvents, 125);
  assert.equal(t.capturedEncoderReleaseGroups, 5); assert.equal(t.incompletePoolSamples, 0);
  assert.equal(t.capExhausted, false); assert.equal(t.browserCap, 240);
  const a = proof.allocation;
  assert.equal(a.pool, "HEVC tab_mvf_pool"); assert.equal(a.requestedLiveBytes, 5817680);
  assert.equal(a.requestedCachedBytes, 0); assert.equal(a.motionVectorUncachingUsefulAtMeasuredFailure, false);
  assert.equal(a.minimumShortfallIgnoringFragmentationAndOverheadBytes, 54788);
  assert.equal(a.minimumShortfallIgnoringFragmentationAndOverheadBytes,
    a.preAbortSnapshot.entryRequestedAllocationBytes - a.availableFreePlusUnclaimedUpperBoundBytes);
  assert.equal(a.totalConcurrentOtherPoolsBytes, null); assert.equal(a.unchangedRetryUseful, false);
});
test("Failed original conversion retains strict whole-tree accounting and honest delayed cleanup evidence", () => {
  assert.equal(proof.source.bytes, 2958573265);
  assert.equal(proof.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.source.inputChanged, false); assert.equal(proof.attemptedRuns, 1);
  assert.equal(proof.completedConversions, 0); assert.equal(proof.metrics.outputBytes, 0);
  assert.equal(proof.independentValidation, null); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.speedGainClaim, null);
  assert.deepEqual(proof.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  const m = proof.memory;
  assert.equal(m.incrementalPrivateMiB, 218.16015625); assert.equal(m.validSamples, 35); assert.equal(m.unavailableSamples, 0);
  assert.equal(m.incompleteConversion, true); assert.equal(m.acceptance, false);
  assert.equal(m.nativePeak.processes.reduce((sum, p) => sum + p.privateBytes, 0), m.nativePeak.privateBytes);
  assert.equal(m.incrementalPrivateMiB, (Math.max(m.cimPeakPrivateBytes, m.nativePeak.privateBytes) - m.blankBaseline.privateBytes) / 1024 ** 2);
  assert.ok(m.nativePeak.processes.some((p) => p.type === "unknown"));
  assert.equal(proof.cleanup.observedIdentities.length, 19);
  assert.match(proof.cleanup.independentObservedAndOwnedPidCheck, /immediate descendant absence is not claimed/);
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped",
    "sampledChromeRootStopped", "independentlyVerifiedAllObservedAndOwnedPidsAbsent", "independentlyVerifiedSixAssetsRestored",
    "independentlyVerifiedAdaptersAndRuntimeAbsent"]) assert.equal(proof.cleanup[key], true);
  assert.equal(proof.cleanup.hostedArtifactsRemaining, 0); assert.equal(proof.cleanup.sourceBundleDownloaded, false);
  assert.deepEqual(proof.forbiddenRequests, []); assert.match(proof.next, /Goal remains incomplete/);
});
