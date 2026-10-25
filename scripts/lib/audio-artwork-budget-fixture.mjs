// Deterministic INPUT fixture only, never a user-file/image converter. All
// allocations are explicitly bounded by this fixed 1023x1023 / 4MiB recipe.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readFile, realpath, writeFile } from "node:fs/promises";
import path from "node:path";
import { deflateSync } from "node:zlib";
import { appendFlacFixtureComments } from "./audio-comment-validation.mjs";
import { AUDIO_REPEATED_COMMENTS } from "./audio-metadata-fidelity-fixture.mjs";
const root = path.resolve(import.meta.dirname, "../.."), maximumBytes = 4194304;
const sha = b => createHash("sha256").update(b).digest("hex");
const word = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => { let value = n; for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); return value >>> 0; });
function chunk(type, bytes) {
  const kind = Buffer.from(type), body = Buffer.concat([kind, bytes]); let crc = 0xffffffff;
  for (const byte of body) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  return Buffer.concat([word(bytes.length), body, word((crc ^ 0xffffffff) >>> 0)]);
}
export async function createAudioArtworkBudgetFixture(directory) {
  const relative = path.relative(path.join(root, "work"), directory); assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  const info = await lstat(directory); assert.ok(info.isDirectory() && !info.isSymbolicLink()); assert.equal(await realpath(directory), directory);
  const canonical = path.join(directory, "source.flac"), sourceInfo = await lstat(canonical);
  assert.ok(sourceInfo.isFile() && !sourceInfo.isSymbolicLink() && sourceInfo.size === 37086);
  const source = await readFile(canonical); assert.equal(sha(source), "bceca191b7b40164857884b4c95ac5b2b78e0c4969f3fad391b7c421adcc36bc");
  const width = 1023, height = 1023, stride = width * 4 + 1, scanlines = Buffer.alloc(stride * height), pixels = createHash("sha256");
  let state = 0x6d2b79f5;
  for (let y = 0; y < height; y++) {
    const offset = y * stride; scanlines[offset] = 0;
    for (let x = 1; x < stride; x++) { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; scanlines[offset + x] = state & 255; }
    pixels.update(scanlines.subarray(offset + 1, offset + stride));
  }
  const ihdr = Buffer.concat([word(width), word(height), Buffer.from([8, 6, 0, 0, 0])]);
  const signature = Buffer.from("89504e470d0a1a0a", "hex"), compressed = deflateSync(scanlines, { level: 6 });
  const parts = [signature, chunk("IHDR", ihdr), chunk("IDAT", compressed)];
  const used = parts.reduce((n, b) => n + b.length, 0) + 12;
  const paddingBytes = maximumBytes - used - 12; assert.ok(paddingBytes >= 0 && paddingBytes < 65536);
  // A valid private ancillary chunk tunes the exact byte boundary; nearly the
  // entire file is real high-entropy compressed RGBA, not filler/sparse media.
  parts.push(chunk("npAD", Buffer.alloc(paddingBytes)), chunk("IEND", Buffer.alloc(0)));
  const image = Buffer.concat(parts); assert.equal(image.length, maximumBytes);
  const imagePath = path.join(directory, "cover-budget.png"); await writeFile(imagePath, image, { flag: "wx" });
  const description = "Couverture maximale café — 音楽", mime = Buffer.from("image/png"), title = Buffer.from(description);
  const picture = Buffer.concat([word(3), word(mime.length), mime, word(title.length), title, word(width), word(height), word(32), word(0), word(image.length), image]);
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
  assert.ok(generated && generated.length < maximumBytes + 1048576);
  const file = path.join(directory, "source-artwork-png-budget.flac"); await writeFile(file, generated, { flag: "wx" });
  return { file, imagePath, bytes: generated.length, sha256: sha(generated),
    expected: { codec: "png", width, height, bytes: image.length, sha256: sha(image), pictureRole: "Cover (front)", description,
      rgbaSha256: pixels.digest("hex") },
    recipe: { width, height, realCompressedPixelBytes: compressed.length, privateAncillaryPaddingBytes: paddingBytes,
      imageBytes: maximumBytes, noSparsePlaceholder: true, nativeConversionUsed: false } };
}
