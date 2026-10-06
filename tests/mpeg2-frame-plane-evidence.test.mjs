import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { summarizeFramePlaneTrace } from "../scripts/lib/mpeg2-frame-plane-trace.mjs";

const proof = JSON.parse(await readFile(new URL("../evidence/mpeg2-frame-plane-measured-2026-10-06.json", import.meta.url)));
test("Actual source-bound scalar trace attributes the third encoder plane without inferring free memory", async () => {
  for (const [file, hash] of Object.entries(proof.sources))
    assert.equal(createHash("sha256").update(await readFile(new URL(`../${file}`, import.meta.url))).digest("hex"), hash);
  assert.equal(proof.run.databaseId, 37392190577);
  assert.equal(proof.run.headSha, "a5bdf2fc70a8e826121fe64369106ab2313e1d43");
  assert.equal(proof.run.conclusion, "success");
  assert.equal(proof.run.buildSeconds, 268); assert.equal(proof.run.jobSeconds, 316);
  assert.equal(Object.keys(proof.manifest.sources).length, 21);
  assert.equal(Object.keys(proof.manifest.artifacts).length, 3);
  assert.equal(proof.manifest.frameAllocationDiagnostic, true);
  assert.equal(proof.manifest.allocatorDiagnostic, false);
  assert.equal(proof.manifest.nativeAllocator, "dlmalloc");
  assert.deepEqual(proof.manifest.enabledDecoders, ["h263", "hevc", "mpeg4"]);
  assert.deepEqual(proof.actualWasmMemoryLimits,
    [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.deepEqual(summarizeFramePlaneTrace(proof.actualPlaneSamples,
    { error: proof.protected.error, eventsEvicted: 0 }), proof.planeTrace);
  const trace = proof.planeTrace, plane = trace.failedAllocation;
  assert.equal(trace.events, 83); assert.equal(trace.successfulPlaneRequests, 41);
  assert.equal(trace.completeObservedPrefix, true); assert.equal(trace.capReached, false);
  assert.equal(plane.sequence, 83); assert.equal(plane.encoder, true); assert.equal(plane.codecId, 2);
  assert.equal(plane.plane, 2); assert.equal(plane.requestedBytes, 421655);
  assert.equal(plane.frameBufferBytes, 2108206); assert.equal(plane.succeeded, null);
  for (const key of ["actualCacheRetention", "contiguousFreeBlockCapacity", "runtimeHeapSavingsBytes", "speedGainClaim"])
    assert.equal(trace[key], null);
  assert.match(proof.limits, /THIS instrumented run/);
});
test("Small successful encodes, incomplete memory measurement and identity cleanup never certify the failed original", () => {
  assert.equal(proof.small.passedCases, 4);
  assert.deepEqual(proof.small.cases.map((row) => [row.sourceCodec, row.frames, row.outputBytes, row.ssim]),
    [["mpeg4", "48", 321692, 0.992146], ["hevc", "96", 652521, 0.985963]]);
  assert.equal(proof.small.outputsByteIdenticalToNormalCandidate, true);
  assert.equal(proof.small.sameInputSpeedAB, false);
  for (const row of proof.small.adverse) {
    assert.deepEqual(row.partialBytes, []);
    assert.equal(row.metrics.pendingOperations, 0); assert.equal(row.metrics.queuedBytes, 0);
  }
  assert.equal(proof.small.adverse[1].beforeCancel.outputBytes, 349012);
  assert.equal(proof.small.adverse[1].metrics.outputBytes, 599048);
  assert.equal(proof.protected.source.bytes, 2958573265);
  assert.equal(proof.protected.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.protected.source.inputChanged, false);
  assert.equal(proof.protected.completedConversions, 0);
  assert.equal(proof.protected.metrics.outputBytes, 0);
  assert.equal(proof.protected.failedRequestedHeapEndBytes, 33787904);
  assert.equal(proof.protected.independentValidation, null);
  assert.equal(proof.protected.unchangedRetryUseful, false);
  assert.equal(proof.diagnosticOnly, true); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.speedGainClaim, null);
  const memory = proof.memory;
  assert.equal(memory.incrementalPrivateMiB, 186.48828125);
  assert.equal(memory.instrumentedIncompleteConversion, true); assert.equal(memory.acceptance, false);
  assert.equal(memory.validSamples, 28); assert.equal(memory.unavailableSamples, 0);
  assert.equal(memory.nativePeak.privateBytes, memory.nativePeak.processes.reduce((sum, row) => sum + row.privateBytes, 0));
  assert.equal(memory.incrementalPrivateMiB,
    (Math.max(memory.nativePeak.privateBytes, memory.cimPeakPrivateBytes) - memory.blankBaseline.privateBytes) / 1024 ** 2);
  assert.equal(proof.cleanup.independentlyVerifiedFullObservedAndOwnedIdentitiesAbsent, 15);
  assert.equal(proof.cleanup.independentlyVerifiedSmallObservedPidsAbsent, 20);
  const reuse = proof.cleanup.numericPidReuse;
  assert.equal(reuse.originalIdentityGone, true); assert.equal(reuse.unrelatedProcessKilled, false);
  assert.notEqual(reuse.originalName, reuse.laterName);
  assert.ok(Date.parse(reuse.laterCreatedAt) > Date.parse(reuse.originalCreatedAt));
  assert.equal(proof.cleanup.hostedArtifactsRemaining, 0);
  assert.match(proof.next, /Full goal remains incomplete/);
});
