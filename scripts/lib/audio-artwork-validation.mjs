// Small INPUT-fixture construction and independent output inspection only.
// Never an artwork converter or a production file adapter.
import assert from "node:assert/strict";
export const AUDIO_ARTWORK_METADATA_CASES = Object.freeze(["ogg", "opus"].flatMap(source =>
  ["png", "mjpeg"].map(artwork => Object.freeze({ source, destination: "flac", repeated: true, artwork }))));

export function audioArtworkFixtureComment(bytes, codec) {
  assert.ok(Buffer.isBuffer(bytes) && bytes.length > 8 && bytes.length <= 65536, "Only a small generated cover is allowed");
  assert.ok(["png", "mjpeg"].includes(codec));
  if (codec === "png") assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
  else assert.equal(bytes.subarray(0, 3).toString("hex"), "ffd8ff");
  const word = n => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const mime = Buffer.from(codec === "png" ? "image/png" : "image/jpeg");
  const picture = Buffer.concat([word(3), word(mime.length), mime, word(0), word(64), word(64),
    word(codec === "png" ? 32 : 24), word(0), word(bytes.length), bytes]);
  return "METADATA_BLOCK_PICTURE=" + picture.toString("base64");
}

export function validateAudioArtworkPacket(probe, packets, expected) {
  assert.ok(expected && ["png", "mjpeg"].includes(expected.codec));
  assert.equal(expected.width, 64); assert.equal(expected.height, 64);
  assert.ok(Number.isSafeInteger(expected.bytes) && expected.bytes > 8 && expected.bytes <= 65536);
  assert.match(expected.sha256, /^[a-f0-9]{64}$/);
  assert.ok(Array.isArray(probe?.streams)); assert.equal(probe.streams.length, 2, "Exactly audio plus one cover required");
  const audio = probe.streams.filter(s => s.codec_type === "audio"), pictures = probe.streams.filter(s => s.codec_type === "video");
  assert.equal(audio.length, 1); assert.equal(pictures.length, 1);
  const picture = pictures[0]; assert.ok(Number.isSafeInteger(picture.index) && picture.index >= 0);
  assert.notEqual(picture.index, audio[0].index);
  assert.equal(picture.disposition?.attached_pic, 1, "Cover must remain an attached picture, not a video track");
  assert.equal(picture.codec_name, expected.codec); assert.equal(picture.width, expected.width); assert.equal(picture.height, expected.height);
  assert.ok(Array.isArray(packets?.packets)); assert.equal(packets.packets.length, 1, "Exactly one complete image packet required");
  const packet = packets.packets[0]; assert.equal(packet.stream_index, picture.index);
  assert.equal(String(packet.size), String(expected.bytes), "Cover packet length changed");
  assert.equal(packet.data_hash, "SHA256:" + expected.sha256, "Complete embedded cover bytes changed");
  return { status: "passed-exact-cover-packet", ...expected, streamIndex: picture.index, packets: 1 };
}
