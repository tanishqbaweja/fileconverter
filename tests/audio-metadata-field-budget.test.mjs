import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { makeGeneratedFlacFieldBudget, fieldBudgetAddedEntries } from "../scripts/lib/audio-metadata-field-budget-fixture.mjs";
import { parseVorbisCommentBlock, COMMENT_LIMITS } from "../scripts/lib/audio-comment-validation.mjs";
import { AUDIO_TEXT_FIELD_LIMIT_ERROR, validateMetadataFieldBudgetFailure, validateExactMetadataFieldBoundary } from "../scripts/lib/audio-metadata-field-budget-validation.mjs";
const word = value => { const bytes = Buffer.alloc(4); bytes.writeUInt32LE(value); return bytes; };
function syntheticHeaderOnlyFixture() {
  const vendor = Buffer.from("unit-fixture-not-media"), entry = Buffer.from("TITLE=café 音楽");
  const body = Buffer.concat([word(vendor.length), vendor, word(1), word(entry.length), entry]);
  const header = Buffer.alloc(4); header[0] = 0x84; header.writeUIntBE(body.length, 1, 3);
  return Buffer.concat([Buffer.from("fLaC"), header, body, Buffer.from("unit-only-audio-suffix")]);
}

test("explicit generated-input constructor reaches4095/4096/4097 fields without changing any suffix byte or existing reader limit", () => {
  const original = syntheticHeaderOnlyFixture();
  for (const count of [4095, 4096, 4097]) {
    const output = makeGeneratedFlacFieldBudget(original, count), body = output.generated.subarray(8, 8 + output.generated.readUIntBE(5, 3));
    assert.equal(body.readUInt32LE(4 + body.readUInt32LE(0)), count);
    assert.ok(output.generated.subarray(-22).equals(original.subarray(-22)));
    assert.equal(output.summary.inputTextEntries, count); assert.equal(output.expectedAddedEntries.length, count - 1);
    if (count <= 4096) assert.equal(parseVorbisCommentBlock(body).entries.length, count);
    else assert.throws(() => parseVorbisCommentBlock(body), /count bound/);
    assert.equal(output.summary.outputAcceptance, false); assert.equal(output.summary.publicAcceptance, false);
  }
  assert.equal(COMMENT_LIMITS.entries, 4096); assert.equal(COMMENT_LIMITS.bytes, 2097152);
  assert.throws(() => makeGeneratedFlacFieldBudget(original, 4098));
  assert.throws(() => makeGeneratedFlacFieldBudget(Buffer.from("not a FLAC"), 4095));
});

const failureState = error => ({ jobState: "error", workerStatus: "ready", opfsName: null, opfsNames: [], error,
  metrics: { inputBytes: 262144, outputBytes: 0, peakWasmMemoryBytes: 33554432, queuedBytes: 0, pendingOperations: 0,
    peakPendingOperations: 0, maxReadChunkBytes: 262144, maxWriteChunkBytes: 0, peakQueuedBytes: 0 } });
test("native limit rejection requires specific real error, recovered worker, no output/partials, real Wasm and bounded IO", () => {
  const storage = { storageBefore: [], storageAfter: [] };
  for (const [kind, error] of [["text-fields", AUDIO_TEXT_FIELD_LIMIT_ERROR], ["picture-fields", "Bounded Ogg cover serialization failed: No space left on device"]]) {
    const state = failureState(error), proof = validateMetadataFieldBudgetFailure(kind, state, storage);
    assert.equal(proof.outputAcceptance, false); assert.equal(proof.publicAcceptance, false);
    for (const mutate of [s => { s.jobState = "complete"; }, s => { s.workerStatus = "starting"; }, s => { s.error = "unrelated"; },
      s => { s.metrics.outputBytes = 1; }, s => { s.metrics.peakWasmMemoryBytes = 0; }, s => { s.metrics.pendingOperations = 1; }]) {
      const changed = structuredClone(state); mutate(changed); assert.throws(() => validateMetadataFieldBudgetFailure(kind, changed, storage));
    }
    assert.throws(() => validateMetadataFieldBudgetFailure(kind, state, { ...storage, storageAfter: [{ name: "partial" }] }));
  }
});

test("exact total4096 includes the picture and preserves every added UTF8 field/order rather than just canonical tag counts", () => {
  const added = fieldBudgetAddedEntries(4067), fixture = { summary: { inputTextEntries: 4095,
    addedFieldsSha256: "" }, expectedAddedEntries: added };
  // Use the actual constructor's independently serialized expected-field digest.
  const generated = makeGeneratedFlacFieldBudget(syntheticHeaderOnlyFixture(), 4095);
  fixture.expectedAddedEntries = generated.expectedAddedEntries; fixture.summary.addedFieldsSha256 = generated.summary.addedFieldsSha256;
  const comments = { entries: ["TITLE=café 音楽", ...generated.expectedAddedEntries], pictures: [{}] };
  assert.equal(validateExactMetadataFieldBoundary(comments, fixture).totalFields, 4096);
  for (const changed of [{ ...comments, pictures: [] }, { ...comments, entries: comments.entries.slice(1) },
    { ...comments, entries: [comments.entries[0], ...comments.entries.slice(1).toReversed()] }])
    assert.throws(() => validateExactMetadataFieldBoundary(changed, fixture));
});

test("real four-job gate selects exact/over-limit/recovery inputs, projects only native tag diagnostics and independently checks all raw output fields", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--metadata-field-budget-recovery/);
  for (const variant of ["cover4095", "cover4096", "text4097"]) assert.ok(source.includes('fieldBudget: "' + variant + '"'));
  assert.match(source, /validateExactMetadataFieldBoundary\(comments/); assert.match(source, /validateMetadataFieldBudgetFailure\(conversion.metadataFailure/);
  assert.match(source, /samePageMetadataRecovery/); assert.match(source, /compareNativeAudioPcm\(input, output/);
  assert.match(source, /passed-private-metadata-field-rejection-case/); assert.match(source, /bindOpfsOutputValidationBacking/);
  assert.equal(source.split("chromium.launchPersistentContext(").length - 1, 1);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
});

test("first real gate stays FAILED for wrong expected Ogg rejection label, while exact4096 output and real native rejections remain visible", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-25T10-10-43.561Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.status, "failed"); assert.equal(receipt.cases.length, 4);
  assert.equal(receipt.memory.incrementalPrivateMiB, 221.3046875); assert.equal(receipt.memory.validSamples, 505); assert.equal(receipt.memory.unavailableSamples, 0);
  const archive = await readFile(receipt.archive.path); assert.equal(sha(archive), receipt.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw), boundary = report.cases[0], rejected = report.cases[2];
  assert.equal(boundary.status, "passed-small-private-fidelity-and-metadata-case");
  assert.equal(boundary.binaryComments.entries.length, 4095); assert.equal(boundary.binaryComments.pictures.length, 1);
  assert.equal(boundary.exactFieldBoundary.allAddedFieldsPreserved, 4068);
  assert.equal(boundary.output.sha256, "82d2b3e88f7a1ff7484777ad95c35fb5901086da8e322c61d444be3447197723");
  assert.equal(boundary.browserState.metrics.peakWasmMemoryBytes, 92274688); // Actual88MiB, unchanged96MiB maximum.
  assert.equal(boundary.artwork.bytes, 4194304); assert.equal(boundary.fidelity.samples, 96000); assert.ok(boundary.fidelity.psnrDb >= 60);
  assert.equal(rejected.status, "failed"); assert.equal(rejected.browserState.error, AUDIO_TEXT_FIELD_LIMIT_ERROR);
  assert.equal(rejected.browserState.jobState, "error"); assert.equal(rejected.browserState.metrics.outputBytes, 0); assert.deepEqual(rejected.storageAfter, []);
  assert.equal(report.cases[3].status, "failed"); assert.equal(report.cases[3].output.sha256, "e00860de6c495310697e32ad31a0fa859cd0c082e5b8921088e33c55f9db71f3");
  assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.equal(receipt.protectedOriginalUnchanged, true);
  const journal = await readFile(receipt.losslessJournal.file); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  assert.equal(sha(gunzipSync(journal, { maxOutputLength: 8 * 1048576 })), receipt.losslessJournal.sha256);
  const wrapper = await readFile("media/ffmpeg/audio-comment-wrapper-candidate.mjs", "utf8");
  assert.match(wrapper, /Bounded Ogg stream metadata copy failed/);
});
