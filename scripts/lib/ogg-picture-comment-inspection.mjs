// Independent, streaming inspection ONLY. Never a converter or browser adapter.
// One Ogg page and one base64 quartet-aligned chunk at a time. Text retains the
// old 2 MiB/4096-field budget; a single picture has a separate 4 MiB image cap.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { open } from "node:fs/promises";
import { COMMENT_LIMITS, oggPageCrc } from "./audio-comment-validation.mjs";
export const OGG_PICTURE_INSPECTION_LIMITS = Object.freeze({
  pageBytes: 65307, pages: 128, readBytes: 8 * 1048576, identifierBytes: 4096,
  imageBytes: 4 * 1048576, descriptionBytes: 4095, dimension: 4096, pixels: 16 * 1048576,
  pictures: 1, base64ChunkBytes: 16384,
});
const LIMIT = OGG_PICTURE_INSPECTION_LIMITS;
const maximumPictureBytes = 32 + 10 + LIMIT.descriptionBytes + LIMIT.imageBytes;
const maximumEncodedBytes = 4 * Math.ceil(maximumPictureBytes / 3);
const utf8 = bytes => new TextDecoder("utf-8", { fatal: true }).decode(bytes);

// Sources yield fragments that remain valid until next() is called. Consume or
// copy before advancing; never retain views of the reusable Ogg page buffer.
class Cursor {
  constructor(iterator, maximum) { this.iterator = iterator; this.maximum = maximum; this.used = 0; this.fragment = null; this.offset = 0; this.done = false; }
  async chunk(maximum = LIMIT.pageBytes) {
    assert.ok(Number.isSafeInteger(maximum) && maximum > 0 && maximum <= LIMIT.pageBytes);
    if (this.done) return null;
    while (!this.fragment || this.offset === this.fragment.bytes.length) {
      if (this.fragment?.endPacket) { this.done = true; return null; }
      const next = await this.iterator.next();
      if (next.done) { this.done = true; return null; }
      this.fragment = next.value; this.offset = 0;
    }
    const end = Math.min(this.offset + maximum, this.fragment.bytes.length);
    const bytes = this.fragment.bytes.subarray(this.offset, end); this.offset = end; this.used += bytes.length;
    assert.ok(this.used <= this.maximum, "Metadata packet exceeds its fixed bound"); return bytes;
  }
  async exact(size) {
    assert.ok(Number.isSafeInteger(size) && size >= 0 && size <= COMMENT_LIMITS.bytes);
    const bytes = Buffer.alloc(size); let at = 0;
    while (at < size) { const part = await this.chunk(Math.min(size - at, LIMIT.pageBytes)); assert.ok(part, "Truncated metadata packet"); bytes.set(part, at); at += part.length; }
    return bytes;
  }
  async word(bigEndian = false) { const bytes = await this.exact(4); return bigEndian ? bytes.readUInt32BE() : bytes.readUInt32LE(); }
  async key(maximum) {
    assert.ok(maximum > 0 && maximum <= COMMENT_LIMITS.bytes);
    let bytes = Buffer.alloc(Math.min(128, maximum)), used = 0;
    while (used < maximum) {
      const part = await this.chunk(Math.min(maximum - used, 4096)); assert.ok(part, "Truncated comment field");
      const separator = part.indexOf(61), count = separator < 0 ? part.length : separator;
      if (used + count > bytes.length) {
        const grown = Buffer.alloc(Math.min(maximum, Math.max(bytes.length * 2, used + count))); bytes.copy(grown, 0, 0, used); bytes = grown;
      }
      bytes.set(part.subarray(0, count), used); used += count;
      if (separator >= 0) {
        // The unread suffix is still in this very fragment: no page advance,
        // re-read, new queue or retained previous-page view is necessary.
        const unread = part.length - count - 1; this.offset -= unread; this.used -= unread;
        assert.ok(used > 0); const key = bytes.subarray(0, used).toString("latin1");
        assert.match(key, /^[\x20-\x3c\x3e-\x7e]+$/, "Invalid Vorbis field name"); return key;
      }
    }
    throw new Error("Comment field has no bounded separator");
  }
  async end() { assert.equal(await this.chunk(1), null, "Unexpected metadata packet tail"); }
}

async function* pageSegments(reader, fileBytes, metrics) {
  const page = Buffer.alloc(LIMIT.pageBytes); let position = 0, serial, openPacket = false;
  const read = async (offset, size) => {
    assert.ok(position + size <= fileBytes && metrics.readBytes + size <= LIMIT.readBytes, "Truncated or oversized Ogg metadata");
    let done = 0;
    while (done < size) { const result = await reader.read(page, offset + done, size - done, position + done); assert.ok(result.bytesRead > 0); done += result.bytesRead; }
    position += size; metrics.readBytes += size; metrics.maximumReadBytes = Math.max(metrics.maximumReadBytes, size);
  };
  for (let number = 0; number < LIMIT.pages; number++) {
    await read(0, 27); assert.equal(page.subarray(0, 4).toString(), "OggS"); assert.equal(page[4], 0);
    assert.equal(page[5] & ~7, 0); assert.equal(Boolean(page[5] & 1), openPacket, "Ogg continuation mismatch");
    if (number === 0) assert.ok(page[5] & 2, "First Ogg page must begin the logical stream");
    else assert.equal(page[5] & 2, 0, "Unexpected new logical stream");
    assert.equal(page.readUInt32LE(18), number, "Ogg page sequence mismatch");
    serial ??= page.readUInt32LE(14); assert.equal(page.readUInt32LE(14), serial, "Multiplexed/chained metadata is outside this inspector");
    const count = page[26]; await read(27, count); let bodyBytes = 0;
    for (let index = 0; index < count; index++) bodyBytes += page[27 + index];
    await read(27 + count, bodyBytes); metrics.pages++;
    const total = 27 + count + bodyBytes;
    assert.equal(oggPageCrc(page.subarray(0, total)), page.readUInt32LE(22), "Ogg CRC mismatch");
    let at = 27 + count;
    for (let index = 0; index < count; index++) {
      const length = page[27 + index]; openPacket = length === 255;
      const bytes = page.subarray(at, at + length); at += length; yield { bytes, endPacket: !openPacket };
    }
    assert.equal(page[5] & 4, 0, "Ogg stream ended before complete comment inspection");
  }
  throw new Error("Ogg metadata page bound exceeded");
}

async function* decodedPictureChunks(cursor, length, metrics) {
  assert.ok(length > 0 && length <= maximumEncodedBytes && length % 4 === 0, "Picture base64 byte bound/alignment failed");
  let remaining = length;
  while (remaining) {
    const size = Math.min(remaining, LIMIT.base64ChunkBytes), bytes = await cursor.exact(size); remaining -= size;
    const text = bytes.toString("latin1");
    assert.match(text, remaining ? /^[A-Za-z0-9+/]+$/ : /^[A-Za-z0-9+/]*={0,2}$/, "Invalid picture base64");
    const decoded = Buffer.from(text, "base64"); assert.equal(decoded.toString("base64"), text, "Noncanonical picture base64");
    metrics.maximumBase64ChunkBytes = Math.max(metrics.maximumBase64ChunkBytes, bytes.length);
    metrics.maximumDecodedChunkBytes = Math.max(metrics.maximumDecodedChunkBytes, decoded.length);
    yield { bytes: decoded, endPacket: remaining === 0 };
  }
}
async function picture(cursor, length, metrics) {
  const decoded = new Cursor(decodedPictureChunks(cursor, length, metrics)[Symbol.asyncIterator](), maximumPictureBytes);
  const type = await decoded.word(true); assert.ok(type <= 20, "Invalid FLAC picture type");
  const mimeBytes = await decoded.word(true); assert.ok(mimeBytes === 9 || mimeBytes === 10);
  const mime = utf8(await decoded.exact(mimeBytes)); assert.ok(["image/png", "image/jpeg"].includes(mime));
  const descriptionBytes = await decoded.word(true); assert.ok(descriptionBytes <= LIMIT.descriptionBytes);
  const description = utf8(await decoded.exact(descriptionBytes)); assert.ok(!description.includes("\0"));
  const width = await decoded.word(true), height = await decoded.word(true), depth = await decoded.word(true), colors = await decoded.word(true);
  assert.ok(width > 0 && height > 0 && width <= LIMIT.dimension && height <= LIMIT.dimension && width * height <= LIMIT.pixels);
  if (type === 1) assert.ok(width === 32 && height === 32 && mime === "image/png");
  const imageBytes = await decoded.word(true); assert.ok(imageBytes > 0 && imageBytes <= LIMIT.imageBytes, "Picture image byte bound exceeded");
  const hash = createHash("sha256"); let remaining = imageBytes;
  while (remaining) { const part = await decoded.chunk(Math.min(remaining, LIMIT.pageBytes)); assert.ok(part, "Truncated picture image"); hash.update(part); remaining -= part.length; }
  await decoded.end();
  return { type, mime, description, width, height, depth, colors, imageBytes, sha256: hash.digest("hex"), encodedBytes: length };
}

export async function readOggPictureComments(file, format) {
  assert.ok(["ogg", "opus"].includes(format)); const reader = await open(file, "r");
  const metrics = { readBytes: 0, maximumReadBytes: 0, pages: 0, maximumBase64ChunkBytes: 0, maximumDecodedChunkBytes: 0,
    pageBufferBytes: LIMIT.pageBytes, completePacketOrImageBufferAllocated: false };
  let iterator;
  try {
    const info = await reader.stat(); assert.ok(info.isFile() && Number.isSafeInteger(info.size));
    iterator = pageSegments(reader, info.size, metrics)[Symbol.asyncIterator]();
    const identifier = new Cursor(iterator, LIMIT.identifierBytes), magic = format === "opus" ? "OpusHead" : "\x01vorbis";
    assert.equal((await identifier.exact(magic.length)).toString(), magic);
    while (await identifier.chunk()) { /* Bounded identification tail only. */ }
    const cursor = new Cursor(iterator, COMMENT_LIMITS.bytes + maximumEncodedBytes), prefix = format === "opus" ? "OpusTags" : "\x03vorbis";
    assert.equal((await cursor.exact(prefix.length)).toString(), prefix);
    let textBytes = prefix.length;
    const charge = size => { textBytes += size; assert.ok(textBytes <= COMMENT_LIMITS.bytes, "Unchanged text metadata byte bound exceeded"); };
    const vendorBytes = await cursor.word(); charge(4 + vendorBytes);
    const vendor = utf8(await cursor.exact(vendorBytes)), count = await cursor.word(); charge(4);
    assert.ok(count <= COMMENT_LIMITS.entries, "Unchanged comment entry bound exceeded");
    const entries = [], pictures = [];
    for (let index = 0; index < count; index++) {
      const length = await cursor.word(); charge(4);
      assert.ok(length > 0 && length <= COMMENT_LIMITS.bytes + maximumEncodedBytes);
      const key = await cursor.key(Math.min(length, COMMENT_LIMITS.bytes - textBytes)); charge(key.length + 1);
      const remaining = length - key.length - 1; assert.ok(remaining >= 0);
      if (key.toLowerCase() === "metadata_block_picture") {
        assert.ok(pictures.length < LIMIT.pictures, "Picture count bound exceeded");
        pictures.push(await picture(cursor, remaining, metrics));
      } else { charge(remaining); entries.push(key + "=" + utf8(await cursor.exact(remaining))); }
    }
    if (format === "ogg") { charge(1); assert.equal((await cursor.exact(1))[0], 1, "Invalid Vorbis framing bit"); await cursor.end(); }
    else { let padding; while ((padding = await cursor.chunk())) charge(padding.length); }
    if (!pictures.length) assert.ok(metrics.pages <= COMMENT_LIMITS.pages, "Text-only page bound remains unchanged");
    return { format, vendor, entries, pictures, textBytes, metrics, pictureFieldsReportedSeparately: true };
  } finally { try { await iterator?.return(); } finally { await reader.close(); } }
}
