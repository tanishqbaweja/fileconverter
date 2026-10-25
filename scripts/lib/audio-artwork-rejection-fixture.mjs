// Out-of-policy but VALID generated image INPUTS only. Never a user converter.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { createAudioArtworkBudgetFixture } from "./audio-artwork-budget-fixture.mjs";
import { appendFlacFixtureComments } from "./audio-comment-validation.mjs";
import { AUDIO_REPEATED_COMMENTS } from "./audio-metadata-fidelity-fixture.mjs";
const sha = b => createHash("sha256").update(b).digest("hex");
const word = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let value = n; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); return value >>> 0; });
function crc(bytes) { let value = 0xffffffff; for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8); return (value ^ 0xffffffff) >>> 0; }
function chunk(kind, bytes) { const body = Buffer.concat([Buffer.from(kind), bytes]); return Buffer.concat([word(bytes.length), body, word(crc(body))]); }

export function makeOneByteOversizedPng(bytes) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length === 4194304);
  assert.equal(sha(bytes), "82018fd4354618bc019a1ca8ab9b4195b56ed477f976f6337b6d7e53cbcaf37f");
  let at = 8;
  while (at < bytes.length) {
    assert.ok(at + 12 <= bytes.length); const length = bytes.readUInt32BE(at), end = at + 12 + length; assert.ok(end <= bytes.length);
    assert.equal(crc(bytes.subarray(at + 4, end - 4)), bytes.readUInt32BE(end - 4));
    if (bytes.subarray(at + 4, at + 8).toString() === "npAD") {
      const replacement = chunk("npAD", Buffer.concat([bytes.subarray(at + 8, end - 4), Buffer.from([0])]));
      const image = Buffer.concat([bytes.subarray(0, at), replacement, bytes.subarray(end)]); assert.equal(image.length, 4194305); return image;
    }
    at = end;
  }
  throw new Error("Pinned PNG lacks its generated private ancillary chunk");
}
export function makeOnePixelTooWidePng() {
  const width = 4097, height = 1, scanline = Buffer.alloc(1 + width * 4); let state = 0x6d2b79f5;
  for (let index = 1; index < scanline.length; index++) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; scanline[index] = state & 255; }
  const image = Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", Buffer.concat([word(width), word(height), Buffer.from([8, 6, 0, 0, 0])])),
    chunk("IDAT", deflateSync(scanline, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
  assert.ok(image.length < 65536); return { image, width, height, rgbaSha256: sha(scanline.subarray(1)) };
}
async function embed(directory, key, image, expected) {
  assert.ok(["png-over-bytes", "png-over-dimension"].includes(key)); assert.ok(image.length <= 4194305);
  const canonical = path.join(directory, "source.flac"), info = await lstat(canonical);
  assert.ok(info.isFile() && !info.isSymbolicLink() && info.size === 37086);
  const source = await readFile(canonical); assert.equal(sha(source), "bceca191b7b40164857884b4c95ac5b2b78e0c4969f3fad391b7c421adcc36bc");
  const mime = Buffer.from("image/png"), title = Buffer.from(expected.description);
  const picture = Buffer.concat([word(3), word(mime.length), mime, word(title.length), title, word(expected.width), word(expected.height), word(32), word(0), word(image.length), image]);
  const repeated = appendFlacFixtureComments(source, AUDIO_REPEATED_COMMENTS); let at = 4, generated;
  for (let block = 0; block < 128; block++) {
    assert.ok(at + 4 <= repeated.length); const end = at + 4 + repeated.readUIntBE(at + 1, 3); assert.ok(end <= repeated.length);
    if (repeated[at] & 128) {
      const prefix = Buffer.from(repeated.subarray(0, end)); prefix[at] &= 127;
      const header = Buffer.alloc(4); header[0] = 0x86; header.writeUIntBE(picture.length, 1, 3);
      generated = Buffer.concat([prefix, header, picture, repeated.subarray(end)]); break;
    }
    at = end;
  }
  assert.ok(generated && generated.length < 5 * 1048576);
  const file = path.join(directory, `source-artwork-${key}.flac`); await writeFile(file, generated, { flag: "wx" });
  return { file, bytes: generated.length, sha256: sha(generated), expected: { ...expected, bytes: image.length, sha256: sha(image) } };
}
export async function createAudioArtworkRejectionFixtures(directory) {
  // The original constructor checks the exact repository-work realpath and
  // canonical source hash before any derivative write; all paths stay inside.
  const accepted = await createAudioArtworkBudgetFixture(directory), original = await readFile(accepted.imagePath);
  const oversized = makeOneByteOversizedPng(original), wide = makeOnePixelTooWidePng();
  const overBytes = await embed(directory, "png-over-bytes", oversized, { ...accepted.expected, rejectionBoundary: "byte" });
  const overDimension = await embed(directory, "png-over-dimension", wide.image, { ...accepted.expected, width: wide.width, height: wide.height,
    rgbaSha256: wide.rgbaSha256, description: "Largeur hors limite café — 音楽", rejectionBoundary: "dimension" });
  return { accepted, overBytes, overDimension };
}
