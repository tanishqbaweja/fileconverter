// Independent, finite qualification inspector, not a production parser/converter.
// Scope: unflagged ID3v2.4.0 T*/APIC frames from the private browser encoder.
// https://id3.org/id3v2.4.0-structure sections3/4/6; frames sections4.2/4.14.
// FFmpeg8.1.2 id3v2.c metadata names are explicit aliases, not merged scopes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, open } from "node:fs/promises";
export const ID3_INSPECTION_LIMITS = Object.freeze({ tagBytes: 8 * 1048576, frames: 128, readBytes: 4096,
  textFrameBytes: 4096, imageBytes: 4 * 1048576 });
const fields = Object.freeze({ TIT2: "title", TPE1: "artist", TALB: "album", TCON: "genre", TDRC: "date", TRCK: "track",
  TCOM: "composer", TPE2: "album_artist", TPE3: "performer", TPOS: "disc", TCOP: "copyright", TPUB: "publisher",
  TLAN: "language", TENC: "encoded_by", TSSE: "encoder", USLT: "lyrics" });
export function decodeId3Synchsafe(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length === 4); assert.ok(bytes.every(value => value < 128), "Invalid synchsafe integer");
  return bytes.reduce((total, value) => total * 128 + value, 0);
}
function decodeText(bytes, encoding) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= ID3_INSPECTION_LIMITS.textFrameBytes);
  assert.ok([0, 3].includes(encoding), "This finite gate accepts only ISO-8859-1/UTF-8 fixture output, not arbitrary ID3 encodings");
  return encoding === 0 ? bytes.toString("latin1") : new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
}
export function parseId3TextFrame(id, payload) {
  assert.match(id, /^T[A-Z0-9]{3}$/); assert.ok(Buffer.isBuffer(payload) && payload.length >= 2 && payload.length <= ID3_INSPECTION_LIMITS.textFrameBytes);
  const text = decodeText(payload.subarray(1), payload[0]), parts = text.split("\0");
  if (parts.at(-1) === "") parts.pop(); // Exactly the optional frame terminator, not trimming text.
  let key = id, description = null;
  if (id === "TXXX") { assert.ok(parts.length >= 2 && parts[0].length > 0, "Missing TXXX description/value"); description = parts.shift(); key = description; }
  assert.ok(parts.length > 0 && parts.length <= 8 && parts.every(value => value.length > 0));
  return { id, description, field: fields[key] ?? key, values: parts, encoding: payload[0] };
}
export async function readId3Metadata(file) {
  const identity = await lstat(file, { bigint: true }); assert.ok(identity.isFile() && !identity.isSymbolicLink());
  const reader = await open(file, "r"), buffer = Buffer.alloc(ID3_INSPECTION_LIMITS.readBytes);
  const metadata = [], pictures = [], frameIds = [], seen = new Set(); let readBytes = 0, maximumReadBytes = 0;
  const read = async (at, length) => {
    assert.ok(Number.isSafeInteger(at) && at >= 0 && Number.isSafeInteger(length) && length > 0 && length <= buffer.length);
    assert.ok(BigInt(at + length) <= identity.size, "Truncated ID3 data"); let done = 0;
    while (done < length) { const result = await reader.read(buffer, done, length - done, at + done); assert.ok(result.bytesRead > 0); done += result.bytesRead; }
    readBytes += length; maximumReadBytes = Math.max(maximumReadBytes, length); return buffer.subarray(0, length);
  };
  try {
    const header = await read(0, 10); assert.equal(header.subarray(0, 3).toString(), "ID3");
    assert.deepEqual([...header.subarray(3, 6)], [4, 0, 0], "This gate requires ID3v2.4.0 without unsynchronisation/extended/footer flags");
    const tagBytes = decodeId3Synchsafe(header.subarray(6, 10)), end = 10 + tagBytes; assert.ok(tagBytes > 0 && tagBytes <= ID3_INSPECTION_LIMITS.tagBytes);
    assert.ok(BigInt(end) < identity.size, "Tag must fit with an audio payload remaining"); let at = 10, paddingBytes = 0;
    while (at < end) {
      const size = Math.min(10, end - at), frameHeader = await read(at, size);
      if (frameHeader.every(value => value === 0)) {
        paddingBytes = end - at; at += size;
        while (at < end) { const chunk = await read(at, Math.min(buffer.length, end - at)); assert.ok(chunk.every(value => value === 0), "Nonzero ID3 padding"); at += chunk.length; }
        break;
      }
      assert.equal(size, 10); assert.ok(frameIds.length < ID3_INSPECTION_LIMITS.frames);
      const id = frameHeader.subarray(0, 4).toString(); assert.match(id, /^[A-Z0-9]{4}$/);
      const length = decodeId3Synchsafe(frameHeader.subarray(4, 8)); assert.ok(length > 0 && at + 10 + length <= end, "Frame exceeds tag");
      assert.equal(frameHeader.readUInt16BE(8), 0, "Flagged/compressed/encrypted frames are outside this gate");
      const payloadAt = at + 10; frameIds.push(id);
      if (id.startsWith("T")) {
        assert.ok(length <= ID3_INSPECTION_LIMITS.textFrameBytes); const frame = parseId3TextFrame(id, await read(payloadAt, length));
        const unique = id === "TXXX" ? id + ":" + frame.description : id;
        assert.ok(!seen.has(unique), "Duplicate ID3 text-frame identity is not standards-compliant scalar metadata"); seen.add(unique); metadata.push(frame);
      } else if (id === "APIC") {
        assert.equal(pictures.length, 0, "This finite fixture must contain one picture");
        const prefix = await read(payloadAt, Math.min(length, buffer.length)), encoding = prefix[0];
        assert.ok([0, 3].includes(encoding)); const mimeEnd = prefix.indexOf(0, 1); assert.ok(mimeEnd > 1 && mimeEnd <= 64);
        const mime = prefix.subarray(1, mimeEnd).toString("latin1"); assert.ok(["image/png", "image/jpeg"].includes(mime));
        const pictureType = prefix[mimeEnd + 1]; assert.ok(Number.isInteger(pictureType) && pictureType <= 20);
        const descriptionAt = mimeEnd + 2, descriptionEnd = prefix.indexOf(0, descriptionAt); assert.ok(descriptionEnd >= descriptionAt);
        const description = decodeText(prefix.subarray(descriptionAt, descriptionEnd), encoding), imageOffset = descriptionEnd + 1;
        const imageBytes = length - imageOffset; assert.ok(imageBytes > 8 && imageBytes <= ID3_INSPECTION_LIMITS.imageBytes);
        const imagePrefix = prefix.subarray(imageOffset); assert.ok(imagePrefix.length >= 8);
        if (mime === "image/png") assert.equal(imagePrefix.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        else assert.equal(imagePrefix.subarray(0, 3).toString("hex"), "ffd8ff");
        const hash = createHash("sha256").update(imagePrefix); let consumed = imagePrefix.length;
        while (consumed < imageBytes) { const chunk = await read(payloadAt + imageOffset + consumed, Math.min(buffer.length, imageBytes - consumed)); hash.update(chunk); consumed += chunk.length; }
        pictures.push({ mime, pictureType, description, bytes: imageBytes, sha256: hash.digest("hex") });
      } else throw new Error("Unexpected ID3 frame outside T*/APIC qualification scope: " + id);
      at += 10 + length;
    }
    assert.ok(frameIds.length > 0); assert.equal(readBytes, tagBytes + 10, "Every tag byte must be inspected exactly once");
    const after = await reader.stat({ bigint: true });
    for (const key of ["dev", "ino", "size", "mtimeNs"]) assert.equal(after[key], identity[key], "Output changed while independently inspected");
    return { format: "id3v2.4.0", frameIds, metadata, pictures, tagBytes, paddingBytes,
      entries: metadata.flatMap(frame => frame.values.map(value => frame.field + "=" + value)),
      readBytes, maximumReadBytes, fixedReusableBufferBytes: buffer.length, completeTagInspected: true, audioPayloadRead: false,
      fullOutputBufferAllocated: false, qualificationOnly: true };
  } finally { await reader.close(); }
}
export function validateId3FixtureMetadata(inspected, expectedTags, expectedPicture) {
  assert.equal(inspected?.format, "id3v2.4.0"); assert.ok(inspected.completeTagInspected && Array.isArray(inspected.metadata));
  assert.ok(expectedTags && Object.keys(expectedTags).length > 0 && Object.keys(expectedTags).length <= 32);
  const fields = Object.entries(expectedTags).map(([field, value]) => {
    assert.equal(typeof value, "string"); assert.ok(value.length <= 4096);
    const observed = inspected.metadata.filter(frame => frame.field.toLowerCase() === field.toLowerCase()).flatMap(frame => frame.values);
    return { field, expectedValue: value, actualValues: observed, status: observed.length === 1 && observed[0] === value ? "preserved" : "missing-changed-or-ambiguous" };
  });
  assert.ok(expectedPicture && ["png", "mjpeg"].includes(expectedPicture.codec));
  const [picture] = inspected.pictures, pictureType = expectedPicture.pictureRole === "Cover (front)" ? 3 : expectedPicture.pictureRole === "Cover (back)" ? 4 : -1;
  const artwork = { status: inspected.pictures.length === 1 && picture?.mime === (expectedPicture.codec === "png" ? "image/png" : "image/jpeg") &&
    picture.pictureType === pictureType && picture.description === expectedPicture.description && picture.bytes === expectedPicture.bytes && picture.sha256 === expectedPicture.sha256 ? "preserved" : "missing-or-changed", ...picture };
  return { status: fields.every(value => value.status === "preserved") && artwork.status === "preserved" ? "passed" : "failed", fields, artwork,
    rawFramesInspected: true, probeDictionaryNotSubstituted: true, publicAcceptance: false };
}
