import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const AUDIO_TEXT_FIELD_LIMIT_ERROR = "Bounded Ogg stream metadata copy failed: No space left on device";
export function validateMetadataFieldBudgetFailure(kind, state, { storageBefore, storageAfter } = {}) {
  assert.ok(["picture-fields", "text-fields"].includes(kind)); assert.equal(state.jobState, "error");
  assert.equal(state.workerStatus, "ready"); assert.equal(state.opfsName, null); assert.deepEqual(state.opfsNames, []);
  assert.deepEqual(storageBefore, []); assert.deepEqual(storageAfter, []);
  if (kind === "text-fields") assert.ok(state.error.includes(AUDIO_TEXT_FIELD_LIMIT_ERROR));
  else assert.match(state.error, /Bounded Ogg cover serialization failed: No space left on device/);
  const metrics = state.metrics; assert.ok(metrics.inputBytes > 0 && metrics.peakWasmMemoryBytes >= 33554432);
  assert.equal(metrics.outputBytes, 0); assert.equal(metrics.queuedBytes, 0); assert.equal(metrics.pendingOperations, 0);
  assert.ok(metrics.peakPendingOperations <= 1);
  for (const value of [metrics.maxReadChunkBytes, metrics.maxWriteChunkBytes, metrics.peakQueuedBytes]) assert.ok(Number.isFinite(value) && value <= 262144);
  return { status: "passed-private-metadata-field-rejection-and-cleanup", kind, noRetainedPartials: true, workerRecovered: true,
    nativeLimitUnchanged: true, outputAcceptance: false, publicAcceptance: false };
}
export function validateExactMetadataFieldBoundary(comments, fixture) {
  assert.equal(fixture.summary.inputTextEntries, 4095); assert.equal(comments.entries.length, 4095);
  assert.equal(comments.pictures.length, 1); assert.equal(comments.entries.length + comments.pictures.length, 4096);
  const added = comments.entries.filter(entry => entry.startsWith("BOUND_FIELD_"));
  assert.deepEqual(added, fixture.expectedAddedEntries, "Every added Unicode field must survive without omission/reordering");
  const sha256 = createHash("sha256").update(added.join("\n")).digest("hex"); assert.equal(sha256, fixture.summary.addedFieldsSha256);
  return { status: "passed-exact4096-fields-including-cover", textFields: 4095, pictureFields: 1, totalFields: 4096,
    allAddedFieldsPreserved: added.length, addedFieldsSha256: sha256, publicAcceptance: false };
}
