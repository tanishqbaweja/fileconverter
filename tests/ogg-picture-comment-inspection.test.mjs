// Metadata-only unit fixtures, NOT valid media or browser conversion evidence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, open, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { COMMENT_LIMITS, oggPageCrc } from "../scripts/lib/audio-comment-validation.mjs";
import { readOggPictureComments, readOggNativeTextBudgetComments, nativeVorbisEntryBytes, NATIVE_TEXT_INSPECTION_LIMITS,
  OGG_PICTURE_INSPECTION_LIMITS as LIMIT } from "../scripts/lib/ogg-picture-comment-inspection.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const word = (n, big = false) => { const b = Buffer.alloc(4); if (big) b.writeUInt32BE(n); else b.writeUInt32LE(n); return b; };
const picture = (image, { mime = "image/png", type = 3, width = 64, height = 64, description = Buffer.from("Pochette café — 音楽"), declaredBytes = image.length, tail = Buffer.alloc(0) } = {}) => {
  const bytes = Buffer.from(mime);
  return Buffer.concat([word(type, true), word(bytes.length, true), bytes, word(description.length, true), description,
    word(width, true), word(height, true), word(0, true), word(0, true), word(declaredBytes, true), image, tail]).toString("base64");
};
const commentPacket = (format, fields, { vendor = Buffer.from("unit-inspection-only"), count = fields.length, tail = Buffer.alloc(0) } = {}) =>
  Buffer.concat([Buffer.from(format === "opus" ? "OpusTags" : "\x03vorbis"), word(vendor.length), vendor, word(count),
    ...fields.flatMap(value => { const bytes = Buffer.from(value); return [word(bytes.length), bytes]; }), ...(format === "ogg" ? [Buffer.from([1])] : []), tail]);
function page(sequence, flags, segments, body, serial = 123) {
  const header = Buffer.alloc(27); header.write("OggS"); header[5] = flags; header.writeUInt32LE(serial, 14); header.writeUInt32LE(sequence, 18); header[26] = segments.length;
  const bytes = Buffer.concat([header, Buffer.from(segments), body]); bytes.writeUInt32LE(oggPageCrc(bytes), 22); return bytes;
}
async function fixture(file, format, packet, { emptyPages = 0 } = {}) {
  const writer = await open(file, "wx"); let sequence = 0;
  try {
    const identifier = Buffer.from(format === "opus" ? "OpusHead-unit" : "\x01vorbis-unit");
    await writer.writeFile(page(sequence++, 2, [identifier.length], identifier));
    for (let index = 0; index < emptyPages; index++) await writer.writeFile(page(sequence++, 0, [], Buffer.alloc(0)));
    const segments = []; let remaining = packet.length;
    while (remaining >= 255) { segments.push(255); remaining -= 255; } segments.push(remaining);
    let at = 0;
    for (let index = 0; index < segments.length; index += 255) {
      const lacing = segments.slice(index, index + 255), size = lacing.reduce((n, b) => n + b, 0);
      await writer.writeFile(page(sequence++, index ? 1 : 0, lacing, packet.subarray(at, at + size))); at += size;
    }
  } finally { await writer.close(); }
}
async function owned(body) {
  const runtime = await createOwnedRuntimeScratch("ogg-picture-inspection-");
  try { await body(runtime.directory); }
  finally { await runtime.close(); await assert.rejects(lstat(runtime.directory), { code: "ENOENT" }); }
}

test("exact4MiB image hashes incrementally through continued Ogg/Opus pages with independent text/field limits", async () => {
  await owned(async directory => {
    const image = Buffer.alloc(LIMIT.imageBytes, 0x5a), encoded = picture(image);
    for (const format of ["ogg", "opus"]) {
      const file = path.join(directory, "metadata-only." + format);
      await fixture(file, format, commentPacket(format, ["TITLE=café 音楽", "CUSTOM_REPEAT=first", "METADATA_BLOCK_PICTURE=" + encoded, "CUSTOM_REPEAT=second", "END=after-picture"]));
      const result = await readOggPictureComments(file, format);
      assert.deepEqual(result.entries, ["TITLE=café 音楽", "CUSTOM_REPEAT=first", "CUSTOM_REPEAT=second", "END=after-picture"]);
      assert.equal(result.pictures.length, 1); const cover = result.pictures[0];
      assert.equal(cover.imageBytes, LIMIT.imageBytes); assert.equal(cover.sha256, sha(image));
      assert.equal(cover.description, "Pochette café — 音楽"); assert.equal(cover.type, 3); assert.equal(cover.width, 64);
      assert.ok(result.metrics.pages > COMMENT_LIMITS.pages && result.metrics.pages <= LIMIT.pages);
      assert.ok(result.metrics.maximumReadBytes <= 65025); assert.ok(result.metrics.maximumBase64ChunkBytes <= 16384);
      assert.ok(result.metrics.maximumDecodedChunkBytes <= 12288); assert.equal(result.metrics.completePacketOrImageBufferAllocated, false);
      assert.equal(result.metrics.pageBufferBytes, 65307); assert.ok(result.textBytes < 256);
      assert.equal(COMMENT_LIMITS.bytes, 2097152); assert.equal(COMMENT_LIMITS.entries, 4096); assert.equal(COMMENT_LIMITS.pages, 64);
    }
  });
});
test("ordinary text and duplicate order match the existing policy, including empty values and Opus opaque padding", async () => {
  await owned(async directory => {
    for (const format of ["ogg", "opus"]) {
      const file = path.join(directory, "text." + format), fields = ["TITLE=音楽", "REPEAT=one", "REPEAT=two", "EMPTY="];
      await fixture(file, format, commentPacket(format, fields, { tail: format === "opus" ? Buffer.from([0xff, 1, 0]) : Buffer.alloc(0) }));
      const result = await readOggPictureComments(file, format); assert.deepEqual(result.entries, fields); assert.deepEqual(result.pictures, []);
    }
  });
});

test("explicit native dictionary probe accepts exact UTF8+NUL bytes separately from bounded framing; historical policy stays unchanged", async () => {
  assert.equal(nativeVorbisEntryBytes("TRACKNUMBER=é音"), 5 + 5 + 2);
  assert.equal(nativeVorbisEntryBytes("DESCRIPTION=é音"), 7 + 5 + 2);
  assert.equal(nativeVorbisEntryBytes("ALBUMARTIST=é音"), 12 + 5 + 2);
  assert.equal(nativeVorbisEntryBytes("DISCNUMBER=é音"), 4 + 5 + 2);
  await owned(async directory => {
    const fields = ["TRACKNUMBER=3/9", "DESCRIPTION=café 音楽", "REPEAT=first", "REPEAT=second", "A=", "B="];
    const fixed = fields.reduce((n, entry) => n + nativeVorbisEntryBytes(entry), 0), available = 2097152 - fixed;
    fields[4] += "x".repeat(Math.floor(available / 2)); fields[5] += "y".repeat(available - Math.floor(available / 2));
    for (const format of ["opus", "ogg"]) {
      const file = path.join(directory, "native-exact." + format); await fixture(file, format, commentPacket(format, fields));
      const result = await readOggNativeTextBudgetComments(file, format);
      assert.equal(result.nativeDictionaryBytes, 2097152); assert.deepEqual(result.entries, fields); assert.deepEqual(result.pictures, []);
      assert.ok(result.textBytes > 2097152 && result.textBytes <= NATIVE_TEXT_INSPECTION_LIMITS.wireBytes);
      assert.equal(result.metrics.pageBufferBytes, 65307); assert.ok(result.metrics.pages <= 64);
      assert.equal(result.metrics.completePacketOrImageBufferAllocated, false);
      await assert.rejects(readOggPictureComments(file, format), /text metadata byte bound/);
      const over = path.join(directory, "native-over." + format); await fixture(over, format, commentPacket(format, [...fields.slice(0, -1), fields.at(-1) + "z"]));
      await assert.rejects(readOggNativeTextBudgetComments(over, format), /Native dictionary text byte bound/);
    }
    for (const [name, packet] of [
      ["vendor", commentPacket("opus", [], { vendor: Buffer.alloc(1025, 120) })],
      ["picture", commentPacket("opus", ["METADATA_BLOCK_PICTURE=" + picture(Buffer.alloc(128))])],
      ["count", commentPacket("opus", [], { count: 4097 })],
      ["nul", commentPacket("opus", ["TITLE=before\0after"])],
    ]) {
      const file = path.join(directory, name + ".opus"); await fixture(file, "opus", packet); await assert.rejects(readOggNativeTextBudgetComments(file, "opus"));
    }
  });
});
test("exact2MiB aggregate text plus exact4MiB image is supported without resetting text charges across the picture", async () => {
  await owned(async directory => {
    const encoded = picture(Buffer.alloc(LIMIT.imageBytes, 0x5a)), fields = ["T=", "METADATA_BLOCK_PICTURE=" + encoded, "R=x"];
    const fixedTextBytes = 8 + 4 + Buffer.byteLength("unit-inspection-only") + 4 + fields.reduce((total, field, index) =>
      total + 4 + Buffer.byteLength(index === 1 ? "METADATA_BLOCK_PICTURE=" : field), 0);
    fields[0] += "x".repeat(COMMENT_LIMITS.bytes - fixedTextBytes);
    const file = path.join(directory, "both-exact-bounds.opus"); await fixture(file, "opus", commentPacket("opus", fields));
    const result = await readOggPictureComments(file, "opus"); assert.equal(result.textBytes, COMMENT_LIMITS.bytes);
    assert.equal(result.pictures[0].imageBytes, LIMIT.imageBytes); assert.equal(result.entries[0].length, fields[0].length);
    assert.ok(result.metrics.readBytes < LIMIT.readBytes); assert.ok(result.metrics.pages <= LIMIT.pages);
    const invalid = path.join(directory, "aggregate-text-oversize.opus");
    await fixture(invalid, "opus", commentPacket("opus", ["A=" + "x".repeat(1100000), "METADATA_BLOCK_PICTURE=" + picture(Buffer.alloc(128)), "B=" + "x".repeat(1100000)]));
    await assert.rejects(readOggPictureComments(invalid, "opus"), /text metadata byte bound/);
  });
});
test("picture-like ordinary text, oversized vendor/text/count, bad UTF8/key and separator tricks fail unchanged limits", async () => {
  await owned(async directory => {
    const large = "x".repeat(COMMENT_LIMITS.bytes), cases = [
      commentPacket("opus", ["METADATA_BLOCK_PICTURES=" + large]),
      commentPacket("opus", ["TITLE=" + large]),
      commentPacket("opus", [], { vendor: Buffer.alloc(COMMENT_LIMITS.bytes, 120) }),
      commentPacket("opus", [], { count: 4097 }),
      commentPacket("opus", [Buffer.from([84, 61, 255])]),
      commentPacket("opus", ["BAD\0KEY=x"]), commentPacket("opus", ["=missing"]), commentPacket("opus", ["missing-separator"]),
    ];
    for (const [index, packet] of cases.entries()) {
      const file = path.join(directory, "invalid-text-" + index + ".opus"); await fixture(file, "opus", packet);
      await assert.rejects(readOggPictureComments(file, "opus"));
    }
  });
});
test("invalid/duplicate base64 pictures, truncation, extra decoded bytes and invalid MIME/geometry/description fail", async () => {
  await owned(async directory => {
    const image = Buffer.alloc(128, 0xa5), valid = picture(image);
    const cases = [
      [valid, valid], [valid.slice(0, -1)], ["AB=="], [valid.slice(0, 4) + "\n" + valid.slice(5)],
      [valid.slice(0, 4) + "é" + valid.slice(5)],
      [picture(image, { declaredBytes: LIMIT.imageBytes + 1 })], [picture(image, { declaredBytes: 129 })],
      [picture(image, { tail: Buffer.from([1]) })], [picture(image, { mime: "image/gif" })],
      [picture(image, { type: 21 })], [picture(image, { type: 1 })], [picture(image, { width: 4097 })],
      [picture(image, { height: 0 })], [picture(image, { description: Buffer.from([255]) })],
      [picture(image, { description: Buffer.alloc(4096, 120) })], [picture(image, { description: Buffer.from("bad\0description") })],
    ];
    for (const [index, values] of cases.entries()) {
      const file = path.join(directory, "invalid-picture-" + index + ".ogg");
      await fixture(file, "ogg", commentPacket("ogg", values.map(value => "METADATA_BLOCK_PICTURE=" + value)));
      await assert.rejects(readOggPictureComments(file, "ogg"));
    }
  });
});
test("page CRC/sequence/serial/continuation/BOS and truncation are verified independently of comment data", async () => {
  await owned(async directory => {
    const good = path.join(directory, "good.opus"); await fixture(good, "opus", commentPacket("opus", ["TITLE=valid"]));
    const original = await readFile(good), secondPage = 27 + original[26] + original.subarray(27, 27 + original[26]).reduce((n, b) => n + b, 0);
    const mutations = [
      b => { b[b.length - 1] ^= 1; }, b => { b.writeUInt32LE(17, secondPage + 18); },
      b => { b.writeUInt32LE(999, secondPage + 14); }, b => { b[secondPage + 5] |= 1; },
      b => { b[5] = 0; }, b => { b[secondPage + 5] |= 2; }, b => { b[secondPage + 5] |= 8; },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const bytes = Buffer.from(original); mutate(bytes);
      if (index > 0) {
        const at = index === 4 ? 0 : secondPage, size = 27 + bytes[at + 26] + bytes.subarray(at + 27, at + 27 + bytes[at + 26]).reduce((n, b) => n + b, 0);
        bytes.writeUInt32LE(oggPageCrc(bytes.subarray(at, at + size)), at + 22);
      }
      const file = path.join(directory, "bad-page-" + index + ".opus"); await writeFile(file, bytes, { flag: "wx" });
      await assert.rejects(readOggPictureComments(file, "opus"));
    }
    const truncated = path.join(directory, "truncated.opus"); await writeFile(truncated, original.subarray(0, original.length - 1), { flag: "wx" });
    await assert.rejects(readOggPictureComments(truncated, "opus"));
  });
});
test("text-only64-page and absolute128-page bounds cannot be bypassed with empty pages", async () => {
  await owned(async directory => {
    for (const [index, emptyPages] of [64, 128].entries()) {
      const file = path.join(directory, "too-many-pages-" + index + ".opus");
      await fixture(file, "opus", commentPacket("opus", ["TITLE=valid"]), { emptyPages });
      await assert.rejects(readOggPictureComments(file, "opus"));
    }
  });
});
