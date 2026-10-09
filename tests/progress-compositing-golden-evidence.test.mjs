// Retained correctness proof: no Chromium/private-engine build/dist needed for these checks.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { compareProgressCompositingUi } from "../scripts/lib/progress-compositing-golden-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const audit = JSON.parse(await read("evidence/2026-10-09T15-42-44-939Z-progress-compositing-golden-analysis.json"));
const proofBytes = await read(audit.proof.path); assert.equal(sha(proofBytes), audit.proof.sha256); const proof = JSON.parse(proofBytes);
async function decode(record, maximum = 8388608) {
  const gzip = await read(record.path); assert.equal(sha(gzip), record.sha256); assert.equal(gzip.length, record.bytes);
  return gunzipSync(gzip, { maxOutputLength: maximum });
}
const raw = await decode(proof.report.archive); assert.equal(sha(raw), proof.report.rawSha256); assert.equal(raw.length, proof.report.rawBytes);
const report = JSON.parse(raw), rows = kind => report.rows.filter(row => row.kind === kind);
const generatedBytes = await decode(proof.generatedArchive); assert.equal(sha(generatedBytes), proof.generatedArchive.restoredSha256);
const generated = JSON.parse(generatedBytes);
const baselineBytes = await read(proof.baseline.path); assert.equal(sha(baselineBytes), proof.baseline.sha256); const baseline = JSON.parse(baselineBytes);
const baselineRaw = await decode(baseline.compressedReport); assert.equal(sha(baselineRaw), baseline.rawReport.sha256); const baselineReport = JSON.parse(baselineRaw);
const normalCss = await decode(audit.normalStylesheetArchive); assert.equal(sha(normalCss), audit.normalStylesheetArchive.rawSha256);

test("Actual three browser encodes match retained output hashes, frame/timeline/audio/artwork/fidelity gates; original failure not erased", () => {
  assert.equal(proof.status, "failed-or-incomplete"); assert.match(proof.failure, /Inspect PID reuse/);
  assert.equal(audit.originalControllerFailurePreserved, true);
  const conversions = report.rows.filter(row => !row.kind && row.status === "passed"), expected = baselineReport.rows.filter(row => !row.kind && row.status === "passed");
  assert.equal(conversions.length, 3); assert.deepEqual(conversions.map(row => row.destination), ["opfs", "opfs", "direct"]);
  assert.deepEqual(conversions.map(row => row.sourceCodec), ["mpeg4", "hevc", "hevc"]);
  for (let i = 0; i < 3; i++) {
    assert.equal(conversions[i].outputCodec, "mpeg2video"); assert.equal(conversions[i].audioTracks, 2);
    for (const field of ["frames", "outputBytes", "outputSha256", "ssim", "timestampAlignedSsim", "sourceFrameTimes", "outputFrameTimes", "audioPacketHashes"])
      assert.deepEqual(conversions[i][field], expected[i][field], field);
    const m = conversions[i].metrics; assert.equal(m.peakWasmMemoryBytes, 50331648); assert.equal(m.peakPendingOperations, 1);
    assert.equal(m.pendingOperations, 0); assert.equal(m.queuedBytes, 0);
    assert.ok(m.maxReadChunkBytes <= 65536 && m.maxWriteChunkBytes <= 524288 && m.peakQueuedBytes <= 524288);
  }
  for (const kind of ["independent-frame-diagnostic", "independent-decoded-audio", "copied-audio-timing-passed", "independent-presentation-timeline-passed", "attached-picture-preservation"])
    assert.equal(rows(kind).length, 3);
  assert.ok(rows("independent-frame-diagnostic").every(row => row.nativeFullDecodePassed));
  for (const row of rows("independent-decoded-audio")) assert.deepEqual(row.sourceDecodedAudioHashes, row.outputDecodedAudioHashes);
});

test("All executed source preimages, five App/CSS checks, six actual geometry states and reviewed PNGs remain bound", async () => {
  assert.equal(Object.keys(generated.pinnedSources).length, 28); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  for (const [file, text] of Object.entries(generated.pinnedSources)) assert.equal(sha(text), proof.sourcePins[file]);
  assert.equal(rows("actual-served-progress-compositing-candidate").length, 5);
  for (const row of rows("actual-served-progress-compositing-candidate")) assert.deepEqual({ url: row.url, bytes: row.bytes, sha256: row.sha256 }, audit.actualServedApp);
  assert.deepEqual(compareProgressCompositingUi(report, baselineReport, generated.stylesheetBinding, normalCss, generated.historicMatrixCss), audit.geometry);
  assert.equal(audit.geometry.maximumDeltaCssPixels, 0); assert.equal(audit.geometry.cssIntentionallyChanged, true);
  assert.equal(audit.screenshots.length, 6); assert.equal(audit.visualReview.reviewedByMainAgent, true);
  for (const row of audit.screenshots) {
    const bytes = await read(row.path); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
    assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  }
});

test("Actual failure/cancel empty storage and owned helper absence retained; no full-memory/speed/identity/manual/public overclaim", () => {
  for (const kind of ["direct-write-failure", "cancel-after-direct-output"]) {
    assert.equal(rows(kind).length, 1); assert.equal(rows(kind)[0].status, "passed"); assert.deepEqual(rows(kind)[0].partialBytes, []);
  }
  const inventories = report.rows.filter(row => "cleanupRemovedEntries" in row); assert.equal(inventories.length, 5);
  assert.ok(inventories.every(row => row.cleanupRemovedEntries.length === 0));
  for (const row of rows("actual-split-native-ownership")) for (const sample of row.samples) {
    assert.equal(sample.closed, true); assert.equal(sample.activePackets, 0); assert.equal(sample.queuedPackets, 0); assert.equal(sample.queuedFrames, 0);
    assert.equal(sample.copyKernel, undefined); assert.equal(sample.additionalPixelBufferBytes, 0);
  }
  assert.deepEqual(proof.protectedPre, proof.protectedPost); assert.deepEqual(audit.protectedFixture, proof.protectedPre);
  assert.equal(audit.cleanup.helperAudit.length, 2); assert.ok(audit.cleanup.helperAudit.every(row => row.status === "owned-identity-absent"));
  assert.equal(audit.cleanup.nativeFollowUp.originalSampledProcessesNotPresentAtFollowUp, true);
  assert.equal(audit.cleanup.nativeFollowUp.fullIdentityCleanupCertified, false); assert.equal(audit.cleanup.nativeFollowUp.noProcessesKilled, true);
  assert.deepEqual(audit.cleanup.transientPid, { pid: 38860, sampledParentPid: 26052, postCheckParentPid: 38072,
    parentMismatchObserved: true, currentlyAbsent: true, browserBirthIdentityUnavailable: true, noProcessesKilled: true });
  for (const field of ["originalFullSourceAcceptance", "completeChromiumMemoryAcceptance", "conversionSpeedAcceptance", "publicAcceptance", "headedManualValidation"])
    assert.equal(audit[field], false);
  assert.equal(audit.browserMode, "headless"); assert.equal(audit.subprocessWindowsHidden, true);
});
