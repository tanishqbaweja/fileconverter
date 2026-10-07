import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import test from "node:test";
const proofBytes = await readFile(new URL("../evidence/mpeg2-flex-original-2026-10-07.json", import.meta.url));
const proof = JSON.parse(proofBytes);
const analysis = JSON.parse(await readFile(new URL("../evidence/mpeg2-flex-original-analysis-2026-10-07.json", import.meta.url)));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("actual flex original failed at a fixed decoder heap, despite below-limit partial full-tree measurements", () => {
  assert.equal(analysis.input.sha256, sha(proofBytes)); assert.equal(analysis.input.bytes, proofBytes.length);
  assert.equal(proof.rawStatus, "failed"); assert.equal(proof.runs.length, 1);
  assert.equal(proof.runs[0].state.jobState, "error"); assert.equal(proof.runs[0].independentValidation, null);
  assert.match(proof.failure.message, /Cannot enlarge memory arrays to size 33587200 bytes \(OOM\)/);
  assert.equal(proof.completeOriginalConversions, 0); assert.equal(proof.threeRepeatPrivateSessionPassed, false);
  assert.equal(proof.nativePeak.processes.reduce((sum, p) => sum + p.privateBytes, 0), proof.nativePeak.privateBytes);
  assert.equal((proof.nativePeak.privateBytes - proof.blankBaseline.privateBytes) / 1048576, 249.4453125);
  assert.equal(proof.nativeFailureCapture.firstFailure, null); assert.equal(proof.nativeFailureCapture.callback, null);
  assert.equal(analysis.heapFailure.requestedCapacityDifferenceBytes, 32768);
  assert.equal(analysis.heapFailure.failedIndividualAllocationBytes, null);
  assert.equal(analysis.heapFailure.allocationObjectOrCallsite, null);
  assert.deepEqual(analysis.allocatorSamples, []);
  const final = proof.splitFinalSamples[0];
  assert.equal(final.decoderMemoryBytes, 33554432); assert.equal(final.encoderMemoryBytes, 16777216);
  assert.equal(final.frames, 106112); assert.equal(final.completedPackets, 106112);
  assert.equal(final.queuedFrames, 0); assert.equal(final.queuedPackets, 0); assert.equal(final.closed, true);
  assert.equal(analysis.partialMetrics.inputBytes, 1060017306);
  assert.equal(analysis.partialMetrics.outputBytes, 1206298852);
  assert.equal(analysis.partialMetrics.queuedBytes, 0); assert.equal(analysis.partialMetrics.pendingOperations, 0);
  assert.equal(analysis.partialMetrics.peakPendingOperations, 1);
  assert.equal(analysis.completeOriginalConversions, 0); assert.equal(analysis.fullIndependentValidationPerformed, false);
  for (const key of ["publicAcceptance", "fidelityAcceptance", "conversionSpeedAcceptance"])
    assert.equal(analysis[key], false);
  assert.equal(analysis.dom.retainedRows, 1024); assert.equal(analysis.dom.evictedRawRows, 1236);
  assert.equal(analysis.dom.originalBlankOrInitialConversionCountersRetained, false);
  assert.equal(analysis.dom.nativeProcessIdentity, null); assert.equal(analysis.dom.allocationObjectOrCallsite, null);
});

test("terminal flex evidence preserves exact executed source pins and independently verified cleanup", async () => {
  assert.equal(sha(proof.generatedSource), proof.generatedSourceSha256);
  for (const [relative, hash] of Object.entries({ ...proof.sourcePins, ...analysis.sourcePins })) {
    assert.ok(!relative.includes(".."));
    assert.equal(sha(await readFile(new URL(`../${relative}`, import.meta.url))), hash, relative);
  }
  assert.equal(analysis.rawReportVerified, true); assert.equal(analysis.allExecutedSourcesVerified, true);
  for (const key of ["allSampledNativeIdentitiesAbsent", "originalDriverWrapperObserverServerBirthsAbsent",
    "bothRuntimeDirectoriesAbsent", "sixPublishedAssetsRestored", "ninePrivateAssetsAbsent", "protectedFullPostHashMatches", "noProcessesKilled"])
    assert.equal(analysis.cleanup[key], true);
  assert.equal(analysis.cleanup.sampledIdentities, 20); assert.equal(analysis.cleanup.checkedPids, 24);
  assert.deepEqual(analysis.cleanup.observedProcesses, []);
  assert.equal(analysis.cleanup.original.conversionQuiescence.terminalState, "error");
  assert.equal(analysis.source.bytes, 2958573265);
  assert.equal(analysis.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(analysis.noNewConversion, true); assert.equal(analysis.originalUninstrumentedFailureCause, null);
});

test("compact terminal diagnostic archive reconstructs the exact failed raw report, without a report-sized buffer", async () => {
  const compact = JSON.parse(await readFile(new URL("../evidence/mpeg2-flex-original-compaction-2026-10-07.json", import.meta.url)));
  assert.deepEqual(compact.raw, proof.rawReport);
  assert.equal(compact.status, "verified-lossless-diagnostic-compaction");
  for (const key of ["reconstructedRawSizeAndSha256Verified", "rawIdentityRevalidatedBeforeRemoval",
    "uncompressedRawRemoved", "ownedScratchRemoved", "rawFailurePreserved"])
    assert.equal(compact[key], true);
  assert.equal(compact.archive.path, proof.rawReport.path + ".gz");
  assert.equal(compact.archive.bytes, 571813); assert.equal(compact.publicAcceptance, false);
  assert.equal(compact.browserConversionsPerformed, 0); assert.equal(compact.protectedSourceRead, false);
  for (const [relative, hash] of Object.entries(compact.sourcePins))
    assert.equal(sha(await readFile(new URL(`../${relative}`, import.meta.url))), hash);
  const archive = new URL(`../${compact.archive.path}`, import.meta.url);
  assert.equal(sha(await readFile(archive)), compact.archive.sha256);
  const hash = createHash("sha256"); let bytes = 0;
  await pipeline(createReadStream(archive, { highWaterMark: 65536 }), createGunzip({ chunkSize: 65536 }),
    new Writable({ highWaterMark: 65536, write(chunk, encoding, done) {
      bytes += chunk.length;
      if (bytes > 32 * 1048576) return done(new Error("Diagnostic exceeded its original fixed report bound"));
      hash.update(chunk); done();
    } }));
  assert.equal(bytes, proof.rawReport.bytes); assert.equal(hash.digest("hex"), proof.rawReport.sha256);
});
