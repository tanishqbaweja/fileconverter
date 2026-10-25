import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
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
