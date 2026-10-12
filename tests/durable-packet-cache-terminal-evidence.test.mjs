import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/packet-cache-layered-source-archive.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const analysis = JSON.parse(await read("evidence/2026-10-12T10-18-33-321Z-durable-full-terminal-analysis.json"));

test("actual failed original preserves Asyncify input-allocation stack and withholds all acceptance despite below-limit failed-window memory", () => {
  assert.equal(analysis.status, "actual-full-original-failed-asyncify-input-allocation-independently-verified");
  assert.equal(analysis.requestedRuns, 3); assert.equal(analysis.completedValidatedConversions, 0);
  assert.equal(analysis.outputBytesBeforeOwnedDeletion, 4776487861); assert.equal(analysis.lastRecordedBridge.frames, 244859);
  assert.equal(analysis.failedWindowMemory.incrementalPrivateMiB, 235.85546875);
  assert.equal(analysis.failedWindowMemory.conversionValidSamples, 114915); assert.equal(analysis.failedWindowMemory.conversionUnavailableSamples, 0);
  assert.equal(analysis.failedWindowMemory.startupUnavailableSamples, 1);
  assert.equal(analysis.failedHeapExtentBytes, 33624064); assert.equal(analysis.failedIndividualAllocationBytes, null);
  assert.ok(analysis.failureRecord.stack.includes("Object.allocateData"));
  assert.ok(analysis.failureRecord.stack.includes("__asyncjs__within_input_read"));
  for (const key of ["publicAcceptance", "originalFullSourceAcceptance", "completeChromiumMemoryAcceptance", "speedupProven", "fragmentationCauseProven"])
    assert.equal(analysis[key], false, key);
  assert.equal(analysis.independentFullFidelityValidation, null); assert.equal(analysis.noConversionRelaunched, true);
});

test("lossless final checkpoint exactly retains actual baseline/all phase peaks and removes redundant raw checkpoint;346 source joins and owned cleanup hold", async () => {
  const row = analysis.durableCheckpoint, bytes = await read(row.path); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
  const restored = gunzipSync(bytes, { maxOutputLength: 2097152 }); assert.equal(restored.length, row.restoredBytes); assert.equal(sha(restored), row.restoredSha256);
  const checkpoint = JSON.parse(restored); assert.equal(checkpoint.coverageThroughSequence, 117939);
  assert.equal(checkpoint.baseline.privateBytes, 240627712); assert.equal(checkpoint.status, "observer-closed-not-conversion-acceptance");
  assert.equal(row.allPhasePeaksMatchOriginal, true); assert.ok(row.phaseComparisons.every(phase => phase.peaksEqual));
  await assert.rejects(access(path.join(root, "outputs/reports/2026-10-12T10-19-18-453Z-private-mpeg2-packet-cache-full-native-100ms-native-checkpoint.json")), { code: "ENOENT" });
  assert.equal(analysis.ownedExitChecks.length, 26); assert.ok(analysis.ownedExitChecks.every(row => row.ownedBirthAbsent));
  assert.equal(analysis.cleanup.protectedFixtureUnchanged, true); assert.equal(analysis.cleanup.generatedDistRestored, true);
  assert.equal(analysis.cleanup.mediaProfileRuntimeRemoved, true); assert.equal(analysis.supervisorRuntimeRemoved, true);
  const archive = await materializeLayeredFullSourceArchive(root, analysis.sourceArchive); assert.equal(Object.keys(archive.sourcePreimages).length, 346);
  const own = await read(analysis.ownSource.path); assert.equal(sha(own), analysis.ownSource.sha256); assert.deepEqual(own, Buffer.from(analysis.ownSource.preimage, "base64"));
});

test("static actual glue shows256KiB suspension stack plus12-byte header, but cannot claim the measured failed malloc size or a runtime fix", async () => {
  const proof = JSON.parse(await read("evidence/2026-10-12T10-18-33-321Z-asyncify-storage-static.json"));
  assert.equal(sha(await read(proof.artifact.path)), proof.artifact.sha256);
  assert.equal(proof.compiledStackSizeBytes, 262144); assert.equal(proof.staticallyConfiguredAllocationBytes, 262156);
  assert.equal(proof.observedFailedIndividualAllocationBytes, null); assert.equal(proof.noBinaryOrRuntimeChanged, true);
  assert.equal(proof.browserConversionPerformed, false); assert.equal(proof.speedGainProven, false);
  const own = await read(proof.ownSource.path); assert.equal(sha(own), proof.ownSource.sha256); assert.deepEqual(own, Buffer.from(proof.ownSource.preimage, "base64"));
});
