import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { makeGeneratedFlacByteBudget } from "../scripts/lib/audio-metadata-byte-budget-fixture.mjs";
import { validateExactNativeTextByteBoundary, validateMetadataTextByteBudgetFailure } from "../scripts/lib/audio-metadata-byte-budget-validation.mjs";
const word = value => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; };
function headerOnly() {
  const vendor = Buffer.from("unit-only"), value = Buffer.from("TRACKNUMBER=3/9"), body = Buffer.concat([word(vendor.length), vendor, word(1), word(value.length), value]);
  const header = Buffer.alloc(4); header[0] = 0x84; header.writeUIntBE(body.length, 1, 3);
  return Buffer.concat([Buffer.from("fLaC"), header, body, Buffer.from("unit-not-real-media")]);
}
test("bounded generated-input constructor makes exact UTF8 key/value+two-NUL byte limit and one-byte-over, preserving every suffix byte", () => {
  const source = headerOnly();
  for (const delta of [0, 1]) {
    const result = makeGeneratedFlacByteBudget(source, delta), body = result.generated.subarray(8, 8 + result.generated.readUIntBE(5, 3));
    let at = 4 + body.readUInt32LE(), bytes = 0; const count = body.readUInt32LE(at); at += 4;
    for (let index = 0; index < count; index++) {
      const length = body.readUInt32LE(at); at += 4; const value = body.subarray(at, at + length); at += length;
      assert.ok(value.indexOf(61) > 0); bytes += length + 1; // '=' replaced by two NULs: net +1 byte.
    }
    assert.equal(at, body.length); assert.equal(bytes, 2097152 + delta); assert.equal(count, 1025);
    assert.ok(result.generated.subarray(8 + body.length).equals(source.subarray(8 + source.readUIntBE(5, 3))));
    assert.equal(result.summary.nativeDictionaryBytes, bytes); assert.equal(result.expectedAddedEntries.length, 1024);
    assert.ok(result.expectedAddedEntries.every(entry => Buffer.byteLength(entry) < 4096));
    if (!delta) {
      const comments = { policy: "native-UTF8-key-value-plus-two-NULs", nativeDictionaryBytes: bytes, pictures: [],
        entries: ["TRACKNUMBER=3/9", ...result.expectedAddedEntries], textBytes: body.length, wireBytesLimit: 2135056 };
      assert.equal(validateExactNativeTextByteBoundary(comments, result).addedFields, 1024);
      assert.throws(() => validateExactNativeTextByteBoundary({ ...comments, nativeDictionaryBytes: bytes - 1 }, result));
      assert.throws(() => validateExactNativeTextByteBoundary({ ...comments, entries: comments.entries.toReversed() }, result));
    }
  }
  assert.throws(() => makeGeneratedFlacByteBudget(source, -1)); assert.throws(() => makeGeneratedFlacByteBudget(source, 2));
});
test("byte-limit rejection remains strict about native cause, visible friendly prefix and complete cleanup, never output acceptance", () => {
  const state = { jobState: "error", workerStatus: "ready", opfsName: null, opfsNames: [], error:
    "The tags and cover exceed a bounded metadata limit. Native detail: Bounded Ogg stream metadata copy failed: No space left on device",
  metrics: { inputBytes: 2135000, outputBytes: 0, peakWasmMemoryBytes: 33554432, queuedBytes: 0, pendingOperations: 0,
    peakPendingOperations: 0, maxReadChunkBytes: 262144, maxWriteChunkBytes: 0, peakQueuedBytes: 0 } };
  const storage = { storageBefore: [], storageAfter: [] };
  assert.equal(validateMetadataTextByteBudgetFailure(state, storage).outputAcceptance, false);
  for (const error of ["No space left on device", "Bounded Ogg stream metadata copy failed: No space left on device", "The tags and cover exceed a bounded metadata limit. Permission denied"])
    assert.throws(() => validateMetadataTextByteBudgetFailure({ ...state, error }, storage));
});
test("real native budget source still counts every UTF8 key/value and both terminators across scopes, unchanged2MiB/4096 limits", async () => {
  const source = await readFile("media/ffmpeg/audio-text-metadata.h", "utf8");
  assert.match(source, /maximum_bytes = 2 \* 1024 \* 1024/); assert.match(source, /maximum_entries = 4096/);
  assert.match(source, /entry->key, entry->value/); assert.match(source, /bytes \+= length \+ 1/);
});
test("production gate runs exact byte/one-over/recovery in one normal page with projected native diagnostics and full raw-field proof", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--metadata-text-byte-budget-recovery/);
  assert.match(source, /byteBudget: "exact"/); assert.match(source, /byteBudget: "over", metadataFailure: "text-bytes"/);
  assert.match(source, /readOggNativeTextBudgetComments\(output/); assert.match(source, /validateExactNativeTextByteBoundary\(comments/);
  assert.match(source, /validateMetadataTextByteBudgetFailure\(state/); assert.match(source, /samePageByteRecovery/);
  assert.match(source, /const projectedTags = metadataBudget/); assert.match(source, /compareNativeAudioPcm\(input, output/);
  assert.equal(source.split("chromium.launchPersistentContext(").length - 1, 1);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
});
test("retained real byte gate proves exact2MiB text, genuine one-over rejection, same-page recovery, full-tree memory and cleanup", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-25T10-29-39.709Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.status, "passed-selected-small-private-cases-not-promotion"); assert.equal(receipt.publicAcceptance, false);
  assert.equal(receipt.fullMetadataAcceptance, false); assert.equal(receipt.sourcePins, 40); assert.equal(receipt.cases.length, 3);
  assert.equal(receipt.archive.sha256, "5669699801389eaa7bedcdbc08ae7a75a2a997a7b802aba1b7c08b5ed2bc6e62");
  const archive = await readFile(receipt.archive.path); assert.equal(sha(archive), receipt.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 4 * 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw), exact = report.cases[0], over = report.cases[1], recovery = report.cases[2];
  assert.equal(report.nativeConversionUsed, false); assert.equal(report.headedCoverage, false);
  assert.equal(report.metadataByteFixtures.exact.sha256, "e341f49a0fd2267d7cec957c44216970dd93c9bc621b9010cdcf10e4a8861ca5");
  assert.equal(report.metadataByteFixtures.over.sha256, "6c1878e7e3dbf1560bf92effd6d4036faf5ac1b185ac323750b9637893a2223f");
  for (const [key, bytes] of [["exact", 2097152], ["over", 2097153]]) {
    const fixture = report.metadataByteFixtures[key]; assert.equal(fixture.summary.nativeDictionaryBytes, bytes);
    assert.equal(fixture.sourcePcmUnchanged.exact, true); assert.equal(fixture.sourcePcmUnchanged.samples, 96000);
    assert.equal(fixture.summary.sourceSuffixUnchanged, true);
  }
  assert.equal(exact.status, "passed-small-private-fidelity-and-metadata-case");
  assert.equal(exact.exactTextByteBoundary.nativeDictionaryBytes, 2097152); assert.equal(exact.exactTextByteBoundary.addedFields, 1024);
  assert.equal(exact.binaryComments.entries.length, 1051); assert.equal(exact.binaryComments.textBytes, 2100342);
  assert.equal(exact.output.sha256, "179f9ddd2b37965fb6dc40dea4d7b2fe783e7bb25ea8e735fc93cadf4121dc13");
  assert.equal(over.status, "passed-private-metadata-byte-rejection-case"); assert.equal(over.metadataErrorVisible, true);
  validateMetadataTextByteBudgetFailure(over.browserState, { storageBefore: over.storageBefore, storageAfter: over.storageAfter });
  assert.equal(recovery.status, "passed-small-private-fidelity-and-metadata-case");
  assert.deepEqual(recovery.samePageByteRecovery, { exactByteBoundaryAndOneOverRejectionPassed: true, noPageOrContextRecreation: true, noStaleErrorOrWarning: true });
  assert.equal(recovery.output.sha256, "e00860de6c495310697e32ad31a0fa859cd0c082e5b8921088e33c55f9db71f3");
  for (const row of [exact, recovery]) {
    assert.equal(row.fidelity.samples, 96000); assert.ok(row.fidelity.psnrDb >= 60); assert.equal(row.output.tags.status, "passed");
    assert.equal(row.physicalValidation.convertedCopyCreated, false); assert.equal(row.physicalValidation.nativeConversionUsed, false);
    assert.equal(row.repeatedValues.length, 2);
  }
  for (const row of report.cases) {
    const metrics = row.browserState.metrics; assert.equal(metrics.peakWasmMemoryBytes, 33554432);
    assert.equal(metrics.queuedBytes, 0); assert.equal(metrics.pendingOperations, 0); assert.ok(metrics.peakPendingOperations <= 1);
    assert.ok(metrics.maxReadChunkBytes <= 262144 && metrics.maxWriteChunkBytes <= 262144 && metrics.peakQueuedBytes <= 262144);
    assert.equal(row.disposableOutputRemoved, true);
  }
  assert.equal(receipt.memory.incrementalPrivateMiB, 177.53515625);
  assert.equal((report.memory.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.equal(receipt.memory.validSamples, 465); assert.equal(receipt.memory.unavailableSamples, 0);
  assert.equal(report.processCleanup.length, 15); assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.equal(receipt.protectedOriginalUnchanged, true); assert.deepEqual(receipt.network.forbidden, []);
  const journal = await readFile(receipt.losslessJournal.file); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  assert.equal(sha(gunzipSync(journal, { maxOutputLength: 8 * 1048576 })), receipt.losslessJournal.sha256);
  assert.equal(report.screenshots.length, 3);
  for (const screenshot of report.screenshots) { assert.equal(screenshot.headedCoverage, false); assert.equal(sha(await readFile(screenshot.path)), screenshot.sha256); }
});
