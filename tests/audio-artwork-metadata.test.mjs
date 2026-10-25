import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { AUDIO_ARTWORK_METADATA_CASES, audioArtworkFixtureComment, validateAudioArtworkPacket } from "../scripts/lib/audio-artwork-validation.mjs";
const expected = { codec: "png", width: 64, height: 64, bytes: 128, sha256: "a".repeat(64) };
const probe = () => ({ streams: [{ index: 0, codec_type: "audio" }, { index: 1, codec_type: "video", codec_name: "png", width: 64, height: 64, disposition: { attached_pic: 1 } }] });
const packets = () => ({ packets: [{ stream_index: 1, size: "128", data_hash: "SHA256:" + expected.sha256 }] });

test("four genuinely new artwork cases combine both Ogg sources, ordered repeated fields and both cover codecs, without text-only replay", () => {
  assert.equal(AUDIO_ARTWORK_METADATA_CASES.length, 4);
  assert.deepEqual(AUDIO_ARTWORK_METADATA_CASES.map(c => [c.source, c.destination, c.artwork, c.repeated]), [
    ["ogg", "flac", "png", true], ["ogg", "flac", "mjpeg", true], ["opus", "flac", "png", true], ["opus", "flac", "mjpeg", true]]);
});
test("fixture comment has exact FLAC picture layout, MIME, bounds and original image bytes", () => {
  for (const codec of ["png", "mjpeg"]) {
    const bytes = Buffer.alloc(128); Buffer.from(codec === "png" ? "89504e470d0a1a0a" : "ffd8ff", "hex").copy(bytes);
    const comment = audioArtworkFixtureComment(bytes, codec); assert.ok(comment.startsWith("METADATA_BLOCK_PICTURE="));
    const picture = Buffer.from(comment.slice(comment.indexOf("=") + 1), "base64");
    assert.equal(picture.readUInt32BE(0), 3); const mimeSize = picture.readUInt32BE(4);
    assert.equal(picture.subarray(8, 8 + mimeSize).toString(), codec === "png" ? "image/png" : "image/jpeg");
    let at = 8 + mimeSize; assert.equal(picture.readUInt32BE(at), 0); at += 4;
    assert.deepEqual([0, 4, 8, 12, 16].map(n => picture.readUInt32BE(at + n)), [64, 64, codec === "png" ? 32 : 24, 0, bytes.length]);
    assert.deepEqual(picture.subarray(at + 20), bytes);
  }
  assert.throws(() => audioArtworkFixtureComment(Buffer.alloc(65537), "png"));
  assert.throws(() => audioArtworkFixtureComment(Buffer.alloc(128), "png"));
  assert.throws(() => audioArtworkFixtureComment(Buffer.alloc(128), "gif"));
});
test("independent cover validator requires exactly one complete, correctly attached, byte-identical packet", () => {
  assert.equal(validateAudioArtworkPacket(probe(), packets(), expected).status, "passed-exact-cover-packet");
  for (const change of [p => p.streams.pop(), p => p.streams.push({ index: 2, codec_type: "data" }),
    p => { p.streams[1].codec_type = "audio"; }, p => { p.streams[1].disposition.attached_pic = 0; },
    p => { p.streams[1].codec_name = "mjpeg"; }, p => { p.streams[1].width = 32; },
    p => { p.streams[1].height = 32; }, p => { p.streams[1].index = 0; }]) {
    const altered = probe(); change(altered); assert.throws(() => validateAudioArtworkPacket(altered, packets(), expected));
  }
  for (const change of [p => p.packets.pop(), p => p.packets.push(p.packets[0]), p => { p.packets[0].stream_index = 0; },
    p => { p.packets[0].size = "127"; }, p => { p.packets[0].data_hash = "SHA256:" + "b".repeat(64); }]) {
    const altered = packets(); change(altered); assert.throws(() => validateAudioArtworkPacket(probe(), altered, expected));
  }
  assert.throws(() => validateAudioArtworkPacket(probe(), packets(), { ...expected, bytes: 65537 }));
});
test("real artwork gate preserves all existing fidelity, process-memory, privacy and cleanup constraints", async () => {
  const source = await readFile(new URL("../scripts/test-audio-metadata-production-runtime.mjs", import.meta.url), "utf8");
  assert.match(source, /--artwork-metadata/); assert.match(source, /artworkMetadata \? AUDIO_ARTWORK_METADATA_CASES/);
  assert.match(source, /\.\.\.AUDIO_REPEATED_COMMENTS, audioArtworkFixtureComment\(bytes, codec\)/);
  assert.match(source, /row.artwork = await inspectArtwork\(output, outputProbe/);
  assert.match(source, /sourcePcmUnchanged: await compareNativeAudioPcm\(original, file, \{ cwd: root, env, lossless: true \}\)/);
  assert.match(source, /"-show_data_hash", "sha256"/); assert.match(source, /"-xerror"/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
  assert.match(source, /artworkAcceptance: false/); assert.match(source, /await runtime.close\(\)/);
});
