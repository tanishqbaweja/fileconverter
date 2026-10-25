// Explicit generated-INPUT diagnostics and output-exclusion checks. These must
// never certify an out-of-budget picture as a supported converter output.
import assert from "node:assert/strict";
export const ARTWORK_BUDGET_EXCLUSION_WARNING = "The source cover art exceeds the bounded 4 MiB, 4096-pixel-side, or 16-megapixel limit and is explicitly excluded.";
export function validateGeneratedRejectedArtwork(probe, packets, expected) {
  assert.ok(expected && ["byte", "dimension"].includes(expected.rejectionBoundary)); assert.equal(expected.codec, "png");
  if (expected.rejectionBoundary === "byte") {
    assert.equal(expected.bytes, 4194305); assert.equal(expected.width, 1023); assert.equal(expected.height, 1023);
  } else {
    assert.equal(expected.width, 4097); assert.equal(expected.height, 1); assert.ok(expected.bytes > 8 && expected.bytes < 65536);
  }
  assert.match(expected.sha256, /^[a-f0-9]{64}$/); assert.match(expected.rgbaSha256, /^[a-f0-9]{64}$/);
  assert.equal(probe.streams.length, 2); assert.equal(probe.streams.filter(s => s.codec_type === "audio").length, 1);
  const pictures = probe.streams.filter(s => s.codec_type === "video"); assert.equal(pictures.length, 1); const cover = pictures[0];
  assert.equal(cover.disposition.attached_pic, 1); assert.equal(cover.codec_name, "png"); assert.equal(cover.width, expected.width); assert.equal(cover.height, expected.height);
  assert.equal(cover.tags.comment, expected.pictureRole); assert.equal(cover.tags.title, expected.description);
  assert.equal(packets.packets.length, 1); const packet = packets.packets[0]; assert.equal(packet.stream_index, cover.index);
  assert.equal(Number(packet.size), expected.bytes); assert.equal(packet.data_hash, "SHA256:" + expected.sha256);
  return { status: "verified-generated-out-of-budget-input-not-output-acceptance", ...expected, publicAcceptance: false };
}
export function validateArtworkBudgetExclusion(probe, comments, warnings) {
  assert.equal(probe.streams.length, 1); assert.equal(probe.streams[0].codec_type, "audio");
  assert.equal(probe.streams[0].disposition?.attached_pic ?? 0, 0);
  assert.deepEqual(comments.pictures, [], "No covert picture comment may remain in the output");
  assert.ok(comments.entries.every(entry => !entry.toLowerCase().startsWith("metadata_block_picture=")));
  assert.ok(Array.isArray(warnings) && warnings.includes(ARTWORK_BUDGET_EXCLUSION_WARNING), "Exact limit/exclusion warning required");
  return { status: "passed-explicit-artwork-budget-exclusion", warning: ARTWORK_BUDGET_EXCLUSION_WARNING, outputPictures: 0 };
}
