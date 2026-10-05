import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const p = JSON.parse(await readFile(new URL("../evidence/mpeg2-uncached-accessories-protected-failure-2026-10-05.json", import.meta.url)));
test("Compiled uncached accessory policy keeps small outputs exact but does not prove original-file fit", async () => {
  assert.equal(p.run.databaseId, 37354667903); assert.equal(p.run.conclusion, "success");
  for (const [file, hash] of Object.entries(p.reducerSources))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash, file);
  assert.equal(p.manifest.encoderAccessoryLifecycleSmoke.status, "passed");
  assert.equal(p.manifest.allocatorDiagnostic, false); assert.equal(Object.keys(p.manifest.sources).length, 17);
  assert.equal(p.manifest.encoderAccessorySourceSha256, "4a2b2d1db11b794c3b8f4963e31cfb23124d09cdf8f0d6998037cbf344b45d9f");
  assert.deepEqual(p.actualWasmMemoryLimits, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.equal(p.small.passedCases, 4); assert.equal(p.small.outputsByteIdenticalToPriorCandidate, true);
  assert.deepEqual(p.small.cases.map((x) => [x.frames, x.outputBytes, x.ssim]), [["48", 321692, 0.992146], ["96", 652521, 0.985963]]);
  for (const c of p.small.cases) {
    assert.equal(c.outputCodec, "mpeg2video"); assert.equal(c.metrics.peakWasmMemoryBytes, 33554432);
    assert.ok(c.metrics.maxReadChunkBytes <= 262144 && c.metrics.maxWriteChunkBytes <= 262144);
    assert.equal(c.metrics.peakPendingOperations, 1);
    c.outputFrameTimes.forEach((time, i) => assert.ok(Math.abs(time - c.sourceFrameTimes[i]) <= 0.001));
  }
  const decoded = p.small.independent.filter((x) => x.kind === "independent-decoded-audio");
  assert.equal(decoded.length, 2);
  for (const row of decoded) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
  for (const a of p.small.adverse) {
    assert.equal(a.status, "passed"); assert.deepEqual(a.partialBytes, []);
    assert.equal(a.metrics.queuedBytes, 0); assert.equal(a.metrics.pendingOperations, 0);
  }
  assert.equal(p.small.adverse[1].beforeCancel.outputBytes, 349012);
  assert.equal(p.small.adverse[1].terminalState, "cancelled"); assert.equal(p.small.adverse[1].metrics.outputBytes, 732122);
  assert.equal(p.protected.source.bytes, 2958573265);
  assert.equal(p.protected.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(p.protected.requestedRuns, 3); assert.equal(p.protected.attemptedRuns, 1);
  assert.equal(p.protected.completedConversions, 0); assert.equal(p.protected.metrics.outputBytes, 0);
  assert.equal(p.protected.failedRequestedHeapEndBytes, 33902168);
  assert.equal(p.protected.actualEncoderCacheRetentionAfterPatch, null);
  assert.equal(p.protected.exactFailedAuxiliaryPoolIdentity, null); assert.equal(p.protected.unchangedRetryUseful, false);
});
test("Incomplete normal candidate preserves full-tree memory and cleanup without a speed or support claim", () => {
  assert.equal(p.publicAcceptance, false); assert.equal(p.primaryMemoryAcceptance, false);
  assert.equal(p.speedGainClaim, null); assert.equal(p.small.sameInputSpeedAB, false);
  const m = p.memory;
  assert.equal(m.incrementalPrivateMiB, 196.25390625); assert.equal(m.validSamples, 14); assert.equal(m.unavailableSamples, 0);
  assert.equal(m.incompleteConversion, true); assert.equal(m.acceptance, false);
  assert.equal(m.nativePeak.privateBytes, m.nativePeak.processes.reduce((n, x) => n + x.privateBytes, 0));
  assert.equal(m.incrementalPrivateMiB, (Math.max(m.nativePeak.privateBytes, m.cimPeakPrivateBytes) - m.blankBaseline.privateBytes) / 1024 ** 2);
  assert.ok(m.nativePeak.processes.some((x) => x.type === "unknown"));
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped",
    "sampledChromeRootStopped", "independentlyVerifiedAll20FullObservedAndOwnedPidsAbsent",
    "independentlyVerifiedAll21SmallObservedPidsAbsent", "independentlyVerifiedSixAssetsRestored",
    "independentlyVerifiedAdaptersAndRuntimeAbsent"]) assert.equal(p.cleanup[key], true);
  assert.equal(p.cleanup.hostedArtifactsRemaining, 0); assert.equal(p.cleanup.sourceBundleDownloaded, false);
  assert.match(p.next, /393216 fewer requested bytes/); assert.match(p.next, /Goal remains incomplete/);
});
