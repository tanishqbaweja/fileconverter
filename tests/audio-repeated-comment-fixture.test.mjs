import assert from "node:assert/strict";
import test from "node:test";
import { appendOggFixtureComments } from "../scripts/lib/audio-repeated-comment-fixture.mjs";
import { oggPageCrc, parseVorbisCommentBlock } from "../scripts/lib/audio-comment-validation.mjs";
const word = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const block = entries => Buffer.concat([word(7), Buffer.from("fixture"), word(entries.length), ...entries.flatMap(t => { const b = Buffer.from(t); return [word(b.length), b]; })]);
const packetSegments = packet => { const segments = []; let size = packet.length; while (size >= 255) { segments.push(255); size -= 255; } segments.push(size); return segments; };
function page(sequence, packets) {
  const header = Buffer.alloc(27); header.write("OggS"); header[5] = sequence === 0 ? 2 : sequence === 2 ? 4 : 0;
  header.writeUInt32LE(123, 14); header.writeUInt32LE(sequence, 18);
  const segments = packets.flatMap(packetSegments); header[26] = segments.length;
  const bytes = Buffer.concat([header, Buffer.from(segments), ...packets]); bytes.writeUInt32LE(oggPageCrc(bytes), 22); return bytes;
}
test("small Ogg/Opus fixture rewrite preserves vendor, original fields, setup/audio bytes and raw repeated Unicode values", () => {
  for (const format of ["ogg", "opus"]) for (const length of [1, 223, 600]) {
    const prefix = Buffer.from(format === "ogg" ? "\x03vorbis" : "OpusTags"), tail = Buffer.from(format === "ogg" ? [1] : [0, 0]);
    const first = page(0, [Buffer.from(format === "ogg" ? "\x01vorbis" : "OpusHead")]);
    const setup = Buffer.from("unchanged-codec-setup"), audio = page(2, [Buffer.from("unchanged-audio-packets")]);
    const originalEntries = ["TITLE=" + "x".repeat(length)], packet = Buffer.concat([prefix, block(originalEntries), tail]);
    const source = Buffer.concat([first, page(1, [packet, setup]), audio]);
    const comments = ["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"], output = appendOggFixtureComments(source, format, comments);
    assert.deepEqual(output.subarray(0, first.length), first); assert.deepEqual(output.subarray(-audio.length), audio);
    const offset = first.length, segmentCount = output[offset + 26], segments = output.subarray(offset + 27, offset + 27 + segmentCount);
    const last = segments.findIndex(n => n < 255), size = segments.subarray(0, last + 1).reduce((a, b) => a + b, 0);
    const body = offset + 27 + segmentCount, end = body + segments.reduce((a, b) => a + b, 0);
    assert.equal(oggPageCrc(output.subarray(offset, end)), output.readUInt32LE(offset + 22));
    const parsed = parseVorbisCommentBlock(output.subarray(body + prefix.length, body + size), { trailing: format === "ogg" ? "vorbis-framing" : "opus-padding" });
    assert.equal(parsed.vendor, "fixture"); assert.deepEqual(parsed.entries, [...originalEntries, ...comments]);
    assert.deepEqual(output.subarray(body + size, end), setup);
  }
});
test("fixture-only rewriter rejects full-file-sized, corrupt CRC, truncated, non-comment and invalid-field input", () => {
  const source = Buffer.concat([page(0, [Buffer.from("OpusHead")]), page(1, [Buffer.concat([Buffer.from("OpusTags"), block(["TITLE=x"])])])]);
  const corrupt = Buffer.from(source); corrupt[30] ^= 1;
  assert.throws(() => appendOggFixtureComments(corrupt, "opus", []));
  assert.throws(() => appendOggFixtureComments(source.subarray(0, source.length - 1), "opus", []));
  assert.throws(() => appendOggFixtureComments(Buffer.alloc(1048577), "opus", []));
  assert.throws(() => appendOggFixtureComments(source, "flac", []));
  assert.throws(() => appendOggFixtureComments(source, "opus", ["invalid-field"]));
  assert.throws(() => appendOggFixtureComments(page(0, [Buffer.from("OpusHead")]), "opus", []));
});
