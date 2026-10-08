import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
const read = file => readFile(new URL(`../${file}`, import.meta.url)), sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proof = JSON.parse(await read("evidence/2026-10-08T13-49-53-644Z-stable-progress-ui-headless-golden-validation.json"));
test("Actual headless candidate preserves three independently validated exact video goldens and both recovery cases", async () => {
  assert.equal(proof.status, "passed-5-of-5-headless-private-fidelity-recovery-not-speed-or-memory-acceptance");
  const compressed = await read(proof.compressedReport.path); assert.equal(sha(compressed), proof.compressedReport.sha256);
  const raw = gunzipSync(compressed); assert.equal(raw.length, proof.rawReport.bytes); assert.equal(sha(raw), proof.rawReport.sha256);
  assert.equal(proof.bytesSaved, 508832); assert.equal(proof.rawReportRemovedAfterLosslessArchive, true);
  const report = JSON.parse(raw); assert.equal(report.manifest.aggregateWasmMemoryBytes, 50331648); assert.equal(report.manifest.allowMemoryGrowth, false);
  assert.equal(proof.conversions.length, 3); assert.equal(proof.recovery.length, 2);
  for (const row of proof.conversions) {
    assert.equal(row.outputCodec, "mpeg2video"); assert.equal(row.outputBytes, row.sourceCodec === "hevc" ? 652521 : 321692);
    assert.equal(row.frames, row.sourceCodec === "hevc" ? "96" : "48");
    assert.equal(row.metrics.peakPendingOperations, 1); assert.equal(row.metrics.peakWasmMemoryBytes, 50331648);
    assert.ok(row.metrics.maxReadChunkBytes <= 65536 && row.metrics.maxWriteChunkBytes <= 524288 && row.metrics.peakQueuedBytes <= 524288);
  }
  const audio = report.rows.filter(row => row.kind === "independent-decoded-audio"); assert.equal(audio.length, 3);
  for (const row of audio) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
  for (const row of proof.recovery) { assert.equal(row.status, "passed"); assert.deepEqual(row.partialBytes, []); }
  assert.equal(proof.nativeFullDecodePassed, true); assert.equal(proof.timelinesPassed, 3); assert.equal(proof.artworkPassed, 3);
  assert.equal(proof.emptyCleanupInventories, 5);
});
test("Real served candidate, six inspected headless states, source provenance and cleanup are retained without full-memory or speed claims", async () => {
  for (const [file, hash] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), hash, file);
  assert.equal(sha(await read(proof.verifier.path)), proof.verifier.sha256);
  const envelopeBytes = await read(proof.executionEnvelope.path); assert.equal(sha(envelopeBytes), proof.executionEnvelope.sha256);
  const e = JSON.parse(envelopeBytes); assert.equal(e.browserMode, "headless"); assert.equal(e.failure, null);
  for (const host of [e.hostPreflight, e.launchHostPreflight]) assert.ok(host.freePhysicalBytes >= 2 * 1024 ** 3 && host.freeVirtualBytes >= 2 * 1024 ** 3);
  const generated = JSON.parse(gunzipSync(await read(e.generatedArchive.path)));
  for (const [name, code] of Object.entries(generated)) assert.equal(sha(code), e.generatedHashes[name]);
  assert.ok(generated.spec.includes("headless: true")); assert.ok(!generated.spec.includes("headless: false"));
  assert.equal(proof.actualServedCandidateBindingCount, 5);
  assert.equal(proof.actualServedCandidate.sha256, "d884d80703f4157695736f4fd632f8c1bab06f8a815cff8bb4ea9b6b23514143");
  assert.deepEqual(proof.ui.map(row => row.jobState), ["complete", "complete", "complete", "error", "running", "cancelled"]);
  for (const row of proof.ui) {
    assert.equal(row.matrixCards, 405); assert.equal(row.overflow, false);
    const bytes = await read(row.screenshot.path); assert.equal(sha(bytes), row.screenshot.sha256); assert.equal(bytes.length, row.screenshot.bytes);
  }
  assert.equal(proof.visualReview.allSixHeadlessScreenshotsInspected, true); assert.equal(proof.visualReview.headedManualValidation, false);
  assert.equal(proof.cleanup.observedPidCount, 25); assert.equal(proof.cleanup.nativeBirthsUnavailable, true);
  assert.ok(proof.cleanup.currentProcesses.every(row => Date.parse(row.createdAt) > Date.parse(e.recordedAt)), "Recorded numeric PID reuse is after execution, not an original survivor");
  assert.equal(proof.cleanup.ownedWrapperAbsent, true); assert.equal(proof.cleanup.privateAdditionsAbsent, true);
  assert.equal(Object.keys(proof.cleanup.restoredAssetHashes).length, 6);
  assert.deepEqual(e.protectedPre, e.protectedPost); assert.equal(proof.protectedOriginal.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  for (const name of ["matchingHeadlessGeometryAccepted", "completeChromiumMemoryAcceptance", "originalFullSourceAcceptance", "conversionSpeedAcceptance", "publicAcceptance"]) assert.equal(proof[name], false);
});
