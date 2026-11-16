import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { assertHevcHeaderParserCore } from "./mkv-hevc-header-core-reference.mjs";
import { assertSameMkvNativeBuild } from "./mkv-protected-repeat-contract.mjs";
import { mkvProtectedCopy } from "./mkv-protected-copy-contract.mjs";
export const headerStagedReference = Object.freeze({
  file: "evidence/2026-11-16T12-50-51-794Z-mkv-hevc-header-core-production-staged.json",
  sha256: "18b85a75ae36b2d2b179d529c104da4e64d250cdef165d9e655dec096957dca0",
});
export function readHeaderStagedReference(bytes, tools, productionWorkerSha256) {
  assert.equal(createHash("sha256").update(bytes).digest("hex"), headerStagedReference.sha256);
  const r = JSON.parse(bytes), [a] = r.arms;
  assert.equal(r.status, "passed-unmodified-production-staged-header-core-not-public-or-scale-acceptance");
  assert.equal(r.hevcHeaderProductionStagedIntegration, true); assertHevcHeaderParserCore(tools); assertSameMkvNativeBuild(r.candidateBuild, tools);
  assert.equal(a.workerResponses, 0); assert.equal(a.releaseWorker.overrides, false); assert.ok(a.releaseWorker.requests > 0); assert.equal(a.overlay, undefined);
  const binding = a.productionWorkerBinding;
  assert.equal(binding.sha256, a.releaseWorker.sha256); assert.equal(binding.sha256, productionWorkerSha256);
  assert.equal(binding.status, "verified-exact-built-production-worker-served-with-security-headers");
  assert.equal(binding.staticCodeOnly, true); assert.equal(binding.browserWorkerResponseOverridden, false); assert.equal(binding.applicationSourcesPatched, false);
  assert.deepEqual(a.cases.map(c => c.state), ["complete", "cancelled", "error", "complete"]);
  for (const c of [a.cases[0], a.cases[3]]) {
    const v = c.validation;
    assert.equal(c.metrics.outputBytes, 11894121); assert.equal(v.outputSha256, "19adadcc74ba2a2acde01de262303ba2dcc43035de371999160c115eb7d750e9");
    assert.ok(v.completeDecodedVideoAndPcmEqual && v.candidateGate.passed && c.outputRemoved);
    assert.equal(v.video.packets, 576); assert.equal(v.video.comparableDts, 574); assert.equal(v.aac.packets, 1128);
    for (const key of ["maximumPtsDeltaUs", "maximumDtsDeltaUs", "maximumIntervalErrorUs"]) assert.equal(v.video[key], 0);
    assert.equal(c.metrics.peakScratchBytes, c.metrics.outputBytes); assert.equal(c.metrics.scratchBytes, 0);
    assert.equal(c.metrics.maxScratchReadChunkBytes, 524288); assert.equal(c.metrics.maxScratchWriteChunkBytes, 524288);
  }
  assert.equal(a.cases[1].metrics.inputBytes, 0); // startup cancellation, not mid-media cancellation
  assert.equal(a.cases[2].metrics.outputBytes, 524288); assert.match(a.cases[2].error, /rejected a bounded write/);
  assert.ok(a.cases.every(c => c.outputRemoved));
  assert.ok(a.memory.incrementalPrivateMiB <= 250 && a.memory.cleanupAboveIdleMiB !== null && a.memory.cleanupAboveIdleMiB <= 96);
  assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.fixtureRuntimeRemoved && r.toolDownloadRemoved);
  assert.ok(a.browserCleanup.status === "owned-observed-pids-absent" ||
    a.birthCleanup?.allObservedBirthsAbsent === true && a.birthCleanup.unresolved.length === 0 && a.birthCleanup.noProcessesKilled === true,
  "All observed owned process births must be proven absent; a reused unrelated PID is never killed");
  assert.deepEqual(r.originalBefore, { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256 }); assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.deepEqual(a.forbiddenRequests, []); assert.deepEqual(a.failures, []); assert.deepEqual(r.failures, []);
  for (const key of ["headed", "browserServicesDisabled", "productionFilesReplaced", "speedGainProven", "nativeConversionUsed", "publicAcceptance"]) assert.equal(r[key], false);
  return { ...headerStagedReference, productionWorkerSha256, sameExactCoreAndUnmodifiedWorkerRequired: true,
    cancellationScope: "startup-before-first-media-read", writeFailureScope: "injected-selected-destination-copy-after512KiB",
    largeFileAcceptance: false, publicAcceptance: false };
}
