// Independent bounded metadata inspection, not conversion. FLAC RFC9639 §8.6;
// Opus RFC7845 §5.2; Ogg framing/CRC follows RFC3533. No FFprobe dictionary can
// conceal a repeated key by folding or overwriting its values here.
import assert from "node:assert/strict";
import { open } from "node:fs/promises";
export const COMMENT_LIMITS = Object.freeze({ bytes: 2 * 1048576, entries: 4096, blocks: 128, pages: 64, fixtureBytes: 1048576 });
export function parseVorbisCommentBlock(bytes, { trailing = "none" } = {}) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= COMMENT_LIMITS.bytes);
  assert.ok(["none", "vorbis-framing", "opus-padding"].includes(trailing));
  let at = 0;
  const length = () => { assert.ok(at + 4 <= bytes.length, "Truncated comment length"); const n = bytes.readUInt32LE(at); at += 4; return n; };
  const text = () => { const n = length(); assert.ok(n <= bytes.length - at, "Truncated comment text");
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(at, at + n)); at += n; return value; };
  const vendor = text(), count = length(); assert.ok(count <= COMMENT_LIMITS.entries, "Comment count bound exceeded");
  const entries = [];
  for (let i = 0; i < count; i++) {
    const value = text(), separator = value.indexOf("="); assert.ok(separator > 0, "Comment lacks a field name");
    assert.match(value.slice(0, separator), /^[\x20-\x3c\x3e-\x7e]+$/); entries.push(value);
  }
  if (trailing === "none") assert.equal(at, bytes.length, "Unexpected FLAC comment tail");
  if (trailing === "vorbis-framing") { assert.equal(bytes.length - at, 1); assert.equal(bytes[at], 1, "Invalid Vorbis framing bit"); }
  return { vendor, entries, decodedBytes: at };
}
export function appendFlacFixtureComments(bytes, comments) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= COMMENT_LIMITS.fixtureBytes, "Only a small generated fixture may be rewritten");
  assert.equal(bytes.subarray(0, 4).toString(), "fLaC"); assert.ok(Array.isArray(comments) && comments.length <= 8);
  let at = 4;
  for (let block = 0; block < COMMENT_LIMITS.blocks; block++) {
    assert.ok(at + 4 <= bytes.length); const kind = bytes[at] & 127, last = bytes[at] & 128, n = bytes.readUIntBE(at + 1, 3);
    assert.ok(at + 4 + n <= bytes.length);
    if (kind === 4) {
      const body = bytes.subarray(at + 4, at + 4 + n), parsed = parseVorbisCommentBlock(body);
      let countOffset = 4 + body.readUInt32LE(0); assert.ok(countOffset + 4 <= body.length);
      const prefix = Buffer.from(body), parts = [prefix]; prefix.writeUInt32LE(parsed.entries.length + comments.length, countOffset);
      for (const comment of comments) { assert.equal(typeof comment, "string"); const value = Buffer.from(comment), length = Buffer.alloc(4);
        length.writeUInt32LE(value.length); parts.push(length, value); }
      const newBody = Buffer.concat(parts); parseVorbisCommentBlock(newBody); assert.ok(newBody.length <= COMMENT_LIMITS.bytes);
      const header = Buffer.from(bytes.subarray(at, at + 4)); header.writeUIntBE(newBody.length, 1, 3);
      const output = Buffer.concat([bytes.subarray(0, at), header, newBody, bytes.subarray(at + 4 + n)]);
      assert.ok(output.length <= COMMENT_LIMITS.fixtureBytes); return output;
    }
    at += 4 + n; if (last) break;
  }
  throw new Error("Generated FLAC fixture lacks bounded Vorbis comments");
}
export function oggPageCrc(page) {
  let crc = 0;
  for (let at = 0; at < page.length; at++) {
    crc ^= (at >= 22 && at < 26 ? 0 : page[at]) << 24;
    for (let bit = 0; bit < 8; bit++) crc = ((crc << 1) ^ (crc & 0x80000000 ? 0x04c11db7 : 0)) >>> 0;
  }
  return crc >>> 0;
}
export async function readAudioCommentEntries(file, format) {
  assert.ok(["flac", "ogg", "opus"].includes(format)); const reader = await open(file, "r"); let readBytes = 0;
  const read = async (at, size) => { assert.ok(size >= 0 && size <= COMMENT_LIMITS.bytes && readBytes + size <= 4 * COMMENT_LIMITS.bytes);
    const bytes = Buffer.alloc(size); let done = 0;
    while (done < size) { const result = await reader.read(bytes, done, size - done, at + done); assert.ok(result.bytesRead > 0, "Truncated metadata"); done += result.bytesRead; }
    readBytes += size; return bytes; };
  try {
    if (format === "flac") {
      assert.equal((await read(0, 4)).toString(), "fLaC"); let at = 4;
      for (let block = 0; block < COMMENT_LIMITS.blocks; block++) {
        const header = await read(at, 4), size = header.readUIntBE(1, 3); assert.ok(size <= COMMENT_LIMITS.bytes);
        if ((header[0] & 127) === 4) return { ...parseVorbisCommentBlock(await read(at + 4, size)), readBytes, format };
        at += 4 + size; if (header[0] & 128) break;
      }
    } else {
      const packet = Buffer.alloc(COMMENT_LIMITS.bytes); let used = 0, at = 0, ordinal = 0, serial;
      for (let number = 0; number < COMMENT_LIMITS.pages; number++) {
        const header = await read(at, 27); assert.equal(header.subarray(0, 4).toString(), "OggS"); assert.equal(header[4], 0);
        assert.equal(header.readUInt32LE(18), number); serial ??= header.readUInt32LE(14); assert.equal(header.readUInt32LE(14), serial);
        assert.equal(Boolean(header[5] & 1), used > 0, "Ogg packet continuation mismatch");
        const lacing = await read(at + 27, header[26]), size = lacing.reduce((n, b) => n + b, 0), body = await read(at + 27 + lacing.length, size);
        assert.equal(oggPageCrc(Buffer.concat([header, lacing, body])), header.readUInt32LE(22), "Ogg CRC mismatch");
        let offset = 0;
        for (const length of lacing) {
          assert.ok(used + length <= packet.length); body.copy(packet, used, offset, offset + length); used += length; offset += length;
          if (length < 255) {
            const value = packet.subarray(0, used); ordinal++;
            if (ordinal === 1) assert.equal(value.subarray(0, format === "opus" ? 8 : 7).toString(), format === "opus" ? "OpusHead" : "\x01vorbis");
            else {
              assert.equal(ordinal, 2); const prefix = format === "opus" ? "OpusTags" : "\x03vorbis";
              assert.equal(value.subarray(0, prefix.length).toString(), prefix);
              return { ...parseVorbisCommentBlock(value.subarray(prefix.length), { trailing: format === "opus" ? "opus-padding" : "vorbis-framing" }), readBytes, format };
            }
            used = 0;
          }
        }
        at += 27 + lacing.length + size;
      }
    }
    throw new Error("Audio comments unavailable within metadata bounds");
  } finally { await reader.close(); }
}
