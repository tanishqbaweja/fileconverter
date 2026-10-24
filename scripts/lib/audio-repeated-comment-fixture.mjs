// Small generated fixtures ONLY, never a production input/output adapter.
// Replace the first complete comment packet, preserving all codec/audio packets,
// granules, serials, sequence numbers and any following packets on the same page.
import assert from "node:assert/strict";
import { COMMENT_LIMITS, oggPageCrc, parseVorbisCommentBlock } from "./audio-comment-validation.mjs";
export function appendOggFixtureComments(bytes, format, comments) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= COMMENT_LIMITS.fixtureBytes);
  assert.ok(["ogg", "opus"].includes(format)); assert.ok(Array.isArray(comments) && comments.length <= 8);
  const prefix = Buffer.from(format === "opus" ? "OpusTags" : "\x03vorbis"), trailing = format === "opus" ? "opus-padding" : "vorbis-framing";
  let at = 0, serial;
  for (let sequence = 0; sequence < COMMENT_LIMITS.pages && at < bytes.length; sequence++) {
    assert.ok(at + 27 <= bytes.length); const header = bytes.subarray(at, at + 27);
    assert.equal(header.subarray(0, 4).toString(), "OggS"); assert.equal(header[4], 0); assert.equal(header.readUInt32LE(18), sequence);
    serial ??= header.readUInt32LE(14); assert.equal(header.readUInt32LE(14), serial);
    const count = header[26]; assert.ok(at + 27 + count <= bytes.length);
    const segments = bytes.subarray(at + 27, at + 27 + count), bodySize = segments.reduce((n, b) => n + b, 0);
    const bodyAt = at + 27 + count, end = bodyAt + bodySize; assert.ok(end <= bytes.length);
    assert.equal(oggPageCrc(bytes.subarray(at, end)), header.readUInt32LE(22)); const body = bytes.subarray(bodyAt, end);
    if (body.subarray(0, prefix.length).equals(prefix)) {
      assert.equal(header[5] & 1, 0, "Fixture comment may not start as a continued packet");
      const lastSegment = segments.findIndex(n => n < 255); assert.ok(lastSegment >= 0, "Fixture comment must end on this page");
      const packetSize = segments.subarray(0, lastSegment + 1).reduce((n, b) => n + b, 0);
      const block = body.subarray(prefix.length, packetSize), parsed = parseVorbisCommentBlock(block, { trailing });
      const existing = Buffer.from(block.subarray(0, parsed.decodedBytes));
      const countAt = 4 + existing.readUInt32LE(0); existing.writeUInt32LE(parsed.entries.length + comments.length, countAt);
      const added = comments.flatMap(comment => { assert.equal(typeof comment, "string"); const text = Buffer.from(comment), length = Buffer.alloc(4);
        length.writeUInt32LE(text.length); return [length, text]; });
      const nextBlock = Buffer.concat([existing, ...added, block.subarray(parsed.decodedBytes)]);
      parseVorbisCommentBlock(nextBlock, { trailing }); const packet = Buffer.concat([prefix, nextBlock]);
      const lacing = []; let remaining = packet.length;
      while (remaining >= 255) { lacing.push(255); remaining -= 255; } lacing.push(remaining);
      const nextSegments = Buffer.concat([Buffer.from(lacing), segments.subarray(lastSegment + 1)]); assert.ok(nextSegments.length <= 255);
      const nextHeader = Buffer.from(header); nextHeader[26] = nextSegments.length;
      const page = Buffer.concat([nextHeader, nextSegments, packet, body.subarray(packetSize)]); page.writeUInt32LE(oggPageCrc(page), 22);
      const output = Buffer.concat([bytes.subarray(0, at), page, bytes.subarray(end)]); assert.ok(output.length <= COMMENT_LIMITS.fixtureBytes);
      return output;
    }
    at = end;
  }
  throw new Error("Generated fixture has no complete bounded Ogg comment packet");
}
