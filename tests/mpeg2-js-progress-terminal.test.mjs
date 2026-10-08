import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { summarizeJsAllocation } from "../scripts/lib/bounded-js-allocation.mjs";
const read = file => readFile(new URL(`../${file}`, import.meta.url)), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proof = JSON.parse(await read("evidence/mpeg2-js-progress-terminal-2026-10-08.json"));
test("Actual cancelled progress run retains exact raw/source/profile archives and served-script bindings", async () => {
  for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), digest, file);
  assert.equal(sha(await read(proof.verifier.path)), proof.verifier.sha256);
  const compressed = await read(proof.compressedReport.path); assert.equal(sha(compressed), proof.compressedReport.sha256);
  const restored = gunzipSync(compressed, { maxOutputLength: 32 * 1024 ** 2 });
  assert.equal(sha(restored), proof.originalReport.sha256); assert.equal(restored.length, proof.originalReport.bytes);
  const raw = JSON.parse(restored); assert.equal(raw.runs[0].state.jobState, "cancelled");
  assert.equal(raw.nativeFailureCapture.firstFailure, null); assert.deepEqual(raw.conversionJsReport.errors, []);
  for (const row of proof.records) {
    // Actual archives were written inside the exact Windows repository reports folder.
    const relative = row.archive.path.replaceAll("\\", "/").replace("H:/Github Repositories/fileconverter/", "");
    assert.match(relative, /^outputs\/reports\//);
    const bytes = await read(relative); assert.equal(sha(bytes), row.archive.sha256);
    const payload = gunzipSync(bytes, { maxOutputLength: 1048576 }); assert.equal(sha(payload), row.archive.restoredSha256);
    const value = JSON.parse(payload); assert.deepEqual(value.summary, summarizeJsAllocation({ profile: value.profile }));
    for (const binding of value.bundleBindings) if (binding.servedSha256)
      assert.ok(proof.servedScripts.some(asset => asset.sha256 === binding.servedSha256 && asset.actualServedBytesCaptured));
  }
  assert.deepEqual(proof.records.map(row => row.summary.sampleCount), [0, 25, 131, 289]);
  assert.ok(proof.records.at(-1).bundleBindings.some(row => /capability-strip/.test(row.context)));
  assert.ok(proof.records.at(-1).bundleBindings.some(row => /media-plan-stream/.test(row.context)));
});
test("Partial measured memory and naturally collected allocations cannot certify the original or sampler lifetime", () => {
  assert.equal(proof.observedPeakPrivateBytes, 465039360);
  assert.equal(proof.blankBaseline.privateBytes, 242888704);
  assert.equal((proof.observedPeakPrivateBytes - proof.blankBaseline.privateBytes) / 1048576, 211.859375);
  assert.equal(proof.partialMetrics.outputBytes, 75014957); assert.equal(proof.partialMetrics.inputBytes, 66771171);
  assert.equal(proof.partialMetrics.wasmMemoryBytes, 50331648); assert.equal(proof.partialMetrics.peakPendingOperations, 1);
  assert.equal(proof.conversionsCompleted, 0); assert.equal(proof.requestedRuns, 3);
  assert.equal(proof.cleanupIdentities.originalIdentityCount, 24); assert.equal(proof.cleanupIdentities.originalIdentitiesAbsent, true);
  assert.equal(proof.runtimeDirectoriesAbsent.length, 3); assert.equal(proof.independentFullPostHashVerified, true);
  assert.equal(proof.partialMediaRemoved, true); assert.equal(proof.rawRemovedAfterVerifiedLosslessCompression, true);
  assert.equal(proof.bytesSaved, 2886615);
  for (const key of ["nativeFailureOccurred", "preCancellationFailureProfileCaptured", "profilerLifetimeAcceptance",
    "durationFixBrowserExecuted", "completeOutputIndependentlyValidated", "repeatabilityAccepted", "nativeAllocationCauseProven",
    "forcedGcUsed", "primaryMemoryAcceptance", "speedAcceptance", "publicAcceptance"])
    assert.equal(proof[key], false);
  assert.equal(proof.durationFixedAtMs, 90000);
});
