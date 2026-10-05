import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { refstructSampleBytes } from "../scripts/lib/refstruct-sample-bytes.mjs";

const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-refstruct-live-pool-measured-2026-10-05.json", import.meta.url)));
test("Actual compiled refstruct measurement preserves source-bound chronology and live-not-idle failure", async () => {
  assert.equal(proof.run.databaseId, 37331006755); assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.manifest.allocatorDiagnostic, true);
  assert.equal(proof.manifest.refstructPoolDiagnosticSmoke.checkedTransitions, 9);
  assert.equal(proof.manifest.sources["mpeg2-candidate.c"], "67d3b8299a9e695ea68f96fdcc51d3f5ba5a694547b3f8288e740990c5f7eac0");
  assert.deepEqual(proof.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  for (const [file, hash] of Object.entries(proof.analysisSources))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash, file);
  const t = proof.telemetry;
  assert.equal(t.orderedEvents.length, 191); assert.equal(t.capturedHeapEvents, 66);
  assert.equal(t.capturedPoolEvents, 125); assert.equal(t.evictedEvents, 0);
  assert.equal(t.poolCapExhausted, false); assert.equal(t.incompletePoolSamples, 0);
  for (const kind of ["heap", "pool"])
    t.orderedEvents.filter((row) => row[0] === kind).forEach((row, i) => assert.equal(row[1], i + 1));
  const before = t.orderedEvents.at(-2), fatal = t.orderedEvents.at(-1);
  assert.deepEqual(before.slice(0, 7), ["heap", 66, 18, 173, false, 1920, 808]);
  assert.deepEqual(fatal.slice(0, 9), ["pool", 125, 19, 4010016, true, 1163520, 1163536, 5, 0]);
  assert.equal(proof.allocation.pool, "HEVC tab_mvf_pool");
  assert.equal(proof.allocation.requestedLiveBytes, 5817680);
  assert.equal(proof.allocation.requestedCachedBytes, 0);
  assert.deepEqual(refstructSampleBytes(proof.allocation.preAbortSnapshot), {
    available: true, requestedLiveBytes: 5817680, requestedCachedBytes: 0,
    requestedTotalBackingBytes: 5817680, allocatorOverheadBytes: null,
  });
  assert.equal(proof.allocation.minimumRequestedShortfallIgnoringFragmentationAndOverheadBytes, 840148);
  assert.equal(proof.allocation.unchangedRetryUseful, false);
});
test("Incomplete full-source diagnostic retains every process and actual cleanup, without acceptance or speed claims", () => {
  assert.equal(proof.source.bytes, 2958573265);
  assert.equal(proof.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.completedConversions, 0); assert.equal(proof.outputBytes, 0);
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.speedGainClaim, null); assert.equal(proof.memory.incompleteConversion, true);
  assert.equal(proof.memory.incrementalPrivateMiB, 195.9453125);
  const peak = proof.memory.nativePeak;
  assert.equal(peak.processes.reduce((sum, p) => sum + p.privateBytes, 0), peak.privateBytes);
  assert.ok(peak.processes.some((p) => p.type === "unknown"));
  assert.equal(proof.memory.validSamples, 19); assert.equal(proof.memory.unavailableSamples, 0);
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged",
    "observerStopped", "sampledChromeRootStopped", "independentlyVerifiedAllObservedPidsAbsent",
    "independentlyVerifiedSixAssetsRestored", "independentlyVerifiedPrivateAdapterAndRuntimeAbsent"])
    assert.equal(proof.cleanup[key], true);
  assert.equal(proof.cleanup.hostedArtifactsRemaining, 0);
  assert.equal(proof.cleanup.sourceBundleDownloaded, false);
  assert.deepEqual(proof.forbiddenRequests, []);
  assert.match(proof.next, /Goal remains incomplete/);
});
