// Small INPUT-fixture construction and independent output inspection only.
// Never an artwork converter or a production file adapter.
import assert from "node:assert/strict";
export const AUDIO_ARTWORK_METADATA_CASES = Object.freeze(["ogg", "opus"].flatMap(source =>
  ["png", "mjpeg"].map(artwork => Object.freeze({ source, destination: "flac", repeated: true, artwork }))));
export const AUDIO_OGG_ARTWORK_CASES = Object.freeze([
  { source: "flac", destination: "ogg" }, { source: "flac", destination: "opus" },
  { source: "ogg", destination: "opus" }, { source: "opus", destination: "ogg", quality: "higher" },
].flatMap(route => ["png", "mjpeg"].map(artwork => Object.freeze({ ...route, repeated: true, artwork }))));

export function audioArtworkFixturePicture(bytes, codec, { pictureType = 3, description = "" } = {}) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length > 8 && bytes.length <= 65536, "Only a small generated cover is allowed");
  assert.ok(["png", "mjpeg"].includes(codec));
  assert.ok([3, 4].includes(pictureType)); assert.equal(typeof description, "string");
  assert.ok(!description.includes("\0") && Buffer.byteLength(description) < 4096);
  if (codec === "png") assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  else assert.equal(bytes.subarray(0, 3).toString("hex"), "ffd8ff");
  const word = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const mime = Buffer.from(codec === "png" ? "image/png" : "image/jpeg");
  const descriptionBytes = Buffer.from(description);
  return Buffer.concat([word(pictureType), word(mime.length), mime, word(descriptionBytes.length), descriptionBytes, word(64), word(64),
    word(codec === "png" ? 32 : 24), word(0), word(bytes.length), bytes]);
}
export function audioArtworkFixtureComment(bytes, codec, options) {
  return "METADATA_BLOCK_PICTURE=" + audioArtworkFixturePicture(bytes, codec, options).toString("base64");
}
export function appendFlacArtworkFixture(bytes, picture) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length <= 1048576, "Only a small generated FLAC input may be rewritten");
  assert.ok(Buffer.isBuffer(picture) && picture.length >= 32 && picture.length <= 65632);
  assert.equal(bytes.subarray(0, 4).toString(), "fLaC");
  let at = 4;
  for (let block = 0; block < 128; block++) {
    assert.ok(at + 4 <= bytes.length); const length = bytes.readUIntBE(at + 1, 3), end = at + 4 + length;
    assert.ok(end <= bytes.length);
    if (bytes[at] & 128) {
      const prefix = Buffer.from(bytes.subarray(0, end)); prefix[at] &= 127;
      const header = Buffer.alloc(4); header[0] = 0x86; header.writeUIntBE(picture.length, 1, 3);
      const output = Buffer.concat([prefix, header, picture, bytes.subarray(end)]); assert.ok(output.length <= 1048576);
      return output;
    }
    at = end;
  }
  throw new Error("Generated FLAC lacks a bounded final metadata block");
}

export function validateAudioArtworkPacket(probe, packets, expected) {
  assert.ok(expected && ["png", "mjpeg"].includes(expected.codec));
  assert.equal(expected.width, 64); assert.equal(expected.height, 64);
  assert.ok(Number.isSafeInteger(expected.bytes) && expected.bytes > 8 && expected.bytes <= 65536);
  return validateBudgetedAudioArtworkPacket(probe, packets, expected);
}
export function validateBudgetedAudioArtworkPacket(probe, packets, expected) {
  assert.ok(expected && ["png", "mjpeg"].includes(expected.codec));
  assert.ok(Number.isSafeInteger(expected.width) && expected.width > 0 && expected.width <= 4096);
  assert.ok(Number.isSafeInteger(expected.height) && expected.height > 0 && expected.height <= 4096 && expected.width * expected.height <= 16 * 1048576);
  assert.ok(Number.isSafeInteger(expected.bytes) && expected.bytes > 8 && expected.bytes <= 4 * 1048576);
  assert.match(expected.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(probe?.streams)); assert.equal(probe.streams.length, 2, "Exactly audio plus one cover required");
  const audio = probe.streams.filter(s => s.codec_type === "audio"), pictures = probe.streams.filter(s => s.codec_type === "video");
  assert.equal(audio.length, 1); assert.equal(pictures.length, 1);
  const picture = pictures[0]; assert.ok(Number.isSafeInteger(picture.index) && picture.index >= 0);
  assert.notEqual(picture.index, audio[0].index);
  assert.equal(picture.disposition?.attached_pic, 1, "Cover must remain an attached picture, not a video track");
  assert.equal(picture.codec_name, expected.codec); assert.equal(picture.width, expected.width); assert.equal(picture.height, expected.height);
  if (Object.hasOwn(expected, "pictureRole")) {
    assert.equal(typeof expected.pictureRole, "string"); assert.equal(typeof expected.description, "string");
    assert.equal(picture.tags?.comment, expected.pictureRole, "Picture role changed");
    assert.equal(picture.tags?.title ?? "", expected.description, "Picture description changed");
  }
  assert.ok(Array.isArray(packets?.packets)); assert.equal(packets.packets.length, 1, "Exactly one complete image packet required");
  const packet = packets.packets[0]; assert.equal(packet.stream_index, picture.index);
  assert.equal(String(packet.size), String(expected.bytes), "Cover packet length changed");
  assert.equal(packet.data_hash, "SHA256:" + expected.sha256, "Complete embedded cover bytes changed");
  return { status: "passed-exact-cover-packet", ...expected, streamIndex: picture.index, packets: 1 };
}
