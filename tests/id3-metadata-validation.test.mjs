import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { decodeId3Synchsafe, parseId3TextFrame, readId3Metadata, validateId3FixtureMetadata,
  ID3_INSPECTION_LIMITS } from "../scripts/lib/id3-metadata-validation.mjs";
import { AUDIO_METADATA_TAGS } from "../scripts/lib/audio-metadata-fidelity-fixture.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
const synchsafe = value => Buffer.from([value >>> 21 & 127, value >>> 14 & 127, value >>> 7 & 127, value & 127]);
const text = (description, value) => Buffer.concat([Buffer.from([3]), Buffer.from(description + "\0" + value + "\0")]);
const frame = (id, payload) => Buffer.concat([Buffer.from(id), synchsafe(payload.length), Buffer.alloc(2), payload]);
const tag = (frames, padding = Buffer.alloc(17)) => { const body = Buffer.concat([...frames, padding]);
  return Buffer.concat([Buffer.from([73, 68, 51, 4, 0, 0]), synchsafe(body.length), body, Buffer.from("synthetic audio tail, not conversion evidence")]); };
test("ID3v2.4 raw text preserves Unicode, literal semicolon/newlines and null-separated values without silent trimming", () => {
  assert.equal(decodeId3Synchsafe(synchsafe(0x0fffffff)), 0x0fffffff);
  assert.throws(() => decodeId3Synchsafe(Buffer.from([0, 128, 0, 0])));
  const title = parseId3TextFrame("TIT2", Buffer.concat([Buffer.from([3]), Buffer.from("  café; 音楽\0Second\0")]));
  assert.equal(title.field, "title"); assert.deepEqual(title.values, ["  café; 音楽", "Second"]);
  assert.equal(parseId3TextFrame("TXXX", text("USLT", "Un vers\n第二行")).field, "lyrics");
  assert.deepEqual(parseId3TextFrame("TXXX", text("custom", "café; one=value")).values, ["café; one=value"]);
  for (const bad of [Buffer.from([3, 0xff]), Buffer.from([1, 0xff, 0xfe, 65, 0]), Buffer.from([3, 0]), Buffer.alloc(4097)])
    assert.throws(() => parseId3TextFrame("TIT2", bad));
  assert.throws(() => parseId3TextFrame("TXXX", Buffer.from([3, 65])));
});
test("finite raw tag inspector hashes a multi-chunk picture with one4KiB reusable buffer and validates all25 fields", async () => {
  const runtime = await createOwnedRuntimeScratch("id3-inspector-test-");
  try {
    // Deliberately synthetic framing unit test, NOT an independently valid PNG/MP3 conversion.
    const picture = Buffer.alloc(8193, 37); Buffer.from("89504e470d0a1a0a", "hex").copy(picture);
    const expected = { codec: "png", bytes: picture.length, sha256: createHash("sha256").update(picture).digest("hex"),
      pictureRole: "Cover (front)", description: "表紙 — Front cover" };
    const imageFrame = frame("APIC", Buffer.concat([Buffer.from([3]), Buffer.from("image/png\0"), Buffer.from([3]), Buffer.from(expected.description + "\0"), picture]));
    const file = path.join(runtime.directory, "synthetic-id3.mp3"); await writeFile(file, tag([
      ...Object.entries(AUDIO_METADATA_TAGS).map(([key, value]) => frame("TXXX", text(key, value))), imageFrame,
    ]), { flag: "wx" });
    const inspected = await readId3Metadata(file); assert.equal(inspected.frameIds.length, 26);
    assert.equal(inspected.maximumReadBytes, 4096); assert.equal(inspected.fixedReusableBufferBytes, 4096);
    assert.equal(inspected.audioPayloadRead, false); assert.equal(inspected.fullOutputBufferAllocated, false);
    assert.equal(inspected.pictures[0].sha256, expected.sha256); assert.equal(inspected.readBytes, inspected.tagBytes + 10);
    assert.equal(validateId3FixtureMetadata(inspected, AUDIO_METADATA_TAGS, expected).status, "passed");
    assert.equal(validateId3FixtureMetadata(inspected, { ...AUDIO_METADATA_TAGS, title: "changed" }, expected).status, "failed");
    assert.equal(validateId3FixtureMetadata(inspected, AUDIO_METADATA_TAGS, { ...expected, pictureRole: "Cover (back)" }).status, "failed");
    assert.equal(validateId3FixtureMetadata(inspected, AUDIO_METADATA_TAGS, { ...expected, sha256: "0".repeat(64) }).status, "failed");
  } finally { await runtime.close(); }
});
test("raw ID3 inspection refuses duplicate frame identities, invalid sizes/flags/padding and excessive text/frame counts", async () => {
  const runtime = await createOwnedRuntimeScratch("id3-malformed-test-");
  try {
    const goodFrame = frame("TIT2", Buffer.from([3, 65, 0]));
    const badFlag = Buffer.from(goodFrame); badFlag[9] = 8;
    const badSize = Buffer.from(goodFrame); badSize[4] = 128;
    const badHeader = tag([goodFrame]); badHeader[5] = 128;
    const hugeTag = tag([goodFrame]); synchsafe(ID3_INSPECTION_LIMITS.tagBytes + 1).copy(hugeTag, 6);
    const fixtures = [tag([goodFrame, goodFrame]), tag([frame("TXXX", text("same", "a")), frame("TXXX", text("same", "b"))]),
      tag([badFlag]), tag([badSize]), badHeader, hugeTag, tag([frame("TIT2", Buffer.alloc(4097, 65))]),
      tag(Array.from({ length: 129 }, (_, index) => frame("TXXX", text("distinct-" + index, "a")))), tag([goodFrame], Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1])),
      tag([frame("PRIV", Buffer.from([65]))]), tag([frame("TIT2", Buffer.from([3, 255]))])];
    for (const [index, bytes] of fixtures.entries()) { const file = path.join(runtime.directory, "invalid-" + index + ".mp3");
      await writeFile(file, bytes, { flag: "wx" }); await assert.rejects(readId3Metadata(file)); }
  } finally { await runtime.close(); }
});
test("new MP3 artwork gate retains25 exact scalar fields, native PCM, physical output binding, separate raw ID3 and no public promotion", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--mp3-artwork-metadata/); assert.match(source, /destination: "mp3", artwork/);
  assert.match(source, /validateId3FixtureMetadata\(comments, expectedTags/); assert.match(source, /readId3Metadata\(output\)/);
  assert.match(source, /mp3ArtworkMetadata \? \[\] : AUDIO_REPEATED_COMMENTS/);
  assert.match(source, /compareNativeAudioPcm\(input, output/); assert.match(source, /physicalValidation = .*mp3ArtworkMetadata/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
});
