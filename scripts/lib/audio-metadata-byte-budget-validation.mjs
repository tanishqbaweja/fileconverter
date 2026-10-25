import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { validateMetadataFieldBudgetFailure } from "./audio-metadata-field-budget-validation.mjs";
export function validateMetadataTextByteBudgetFailure(state, storage) {
  const proof = validateMetadataFieldBudgetFailure("text-fields", state, storage);
  assert.match(state.error, /^The tags and cover exceed a bounded metadata limit/);
  return { ...proof, status: "passed-private-metadata-byte-rejection-and-cleanup", kind: "text-bytes", unchangedNativeByteLimit: 2097152 };
}
export function validateExactNativeTextByteBoundary(comments, fixture) {
  assert.equal(comments.policy, "native-UTF8-key-value-plus-two-NULs");
  assert.equal(fixture.summary.nativeDictionaryBytes, 2097152); assert.equal(comments.nativeDictionaryBytes, 2097152);
  assert.equal(comments.pictures.length, 0); assert.equal(comments.entries.length, fixture.summary.textEntries);
  assert.ok(comments.textBytes > 2097152 && comments.textBytes <= comments.wireBytesLimit, "Container framing is not native dictionary text");
  const added = comments.entries.filter(entry => entry.startsWith("BYTE_BOUND_"));
  assert.deepEqual(added, fixture.expectedAddedEntries, "Every boundary field's UTF8 bytes/order must survive");
  const sha256 = createHash("sha256").update(added.join("\n")).digest("hex"); assert.equal(sha256, fixture.summary.addedFieldsSha256);
  return { status: "passed-exact2097152-native-dictionary-bytes", nativeDictionaryBytes: 2097152, textFields: comments.entries.length,
    addedFields: added.length, addedFieldsSha256: sha256, serializedTextBytes: comments.textBytes, publicAcceptance: false };
}
