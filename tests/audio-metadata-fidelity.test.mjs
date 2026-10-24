import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { AUDIO_METADATA_TAGS, AUDIO_METADATA_FIDELITY_CASES, audioMetadataFixtureArguments } from "../scripts/lib/audio-metadata-fidelity-fixture.mjs";
import { appendFlacFixtureComments, parseVorbisCommentBlock, oggPageCrc } from "../scripts/lib/audio-comment-validation.mjs";
import { comparePcm16 } from "../scripts/lib/streaming-audio-fidelity.mjs";
const block = entries => {
  const word = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; }, vendor = Buffer.from("owned-fixture");
  return Buffer.concat([word(vendor.length), vendor, word(entries.length), ...entries.flatMap(s => { const b = Buffer.from(s); return [word(b.length), b]; })]);
};
test("canonical25 tags exactly match the already-tested fixture recipe; six canonical cases plus one genuinely new duplicate-field case", async () => {
  const text = await readFile(new URL("../tests/browser/audio-expanded-metadata.spec.ts", import.meta.url), "utf8");
  const tree = ts.createSourceFile("audio.ts", text, ts.ScriptTarget.Latest, true); let expression;
  const visit = n => { if (ts.isVariableDeclaration(n) && n.name.getText(tree) === "tags") expression = n.initializer.getText(tree); ts.forEachChild(n, visit); }; visit(tree);
  assert.deepEqual(JSON.parse(JSON.stringify(runInNewContext("(" + expression + ")"))), AUDIO_METADATA_TAGS);
  assert.equal(Object.keys(AUDIO_METADATA_TAGS).length, 25); assert.equal(AUDIO_METADATA_FIDELITY_CASES.length, 7);
  const args = audioMetadataFixtureArguments("flac", "owned.flac"); assert.equal(args.at(-1), "owned.flac");
  assert.ok(args.includes("sine=frequency=997:sample_rate=48000:duration=2")); assert.equal(args.filter(s => s === "-metadata").length, 25);
  assert.throws(() => audioMetadataFixtureArguments("not-a-source", "owned"));
});
test("comment parser retains repeated keys and UTF8 values; malformed/truncated/count/field/trailing inputs fail", () => {
  const bytes = block(["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"]), parsed = parseVorbisCommentBlock(bytes);
  assert.equal(parsed.entries.length, 2); assert.deepEqual(parsed.entries, ["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"]);
  assert.throws(() => parseVorbisCommentBlock(bytes.subarray(0, bytes.length - 1)));
  assert.throws(() => parseVorbisCommentBlock(Buffer.concat([bytes, Buffer.from([1])])));
  assert.deepEqual(parseVorbisCommentBlock(Buffer.concat([bytes, Buffer.from([1])]), { trailing: "vorbis-framing" }).entries, parsed.entries);
  assert.throws(() => parseVorbisCommentBlock(Buffer.concat([bytes, Buffer.from([0])]), { trailing: "vorbis-framing" }));
  assert.throws(() => parseVorbisCommentBlock(block(["invalid"]))); assert.throws(() => parseVorbisCommentBlock(block(["bad\u0000field=value"])));
  assert.deepEqual(parseVorbisCommentBlock(block(["TILDE~=yes"])).entries, ["TILDE~=yes"]);
  const hugeCount = Buffer.from(bytes); hugeCount.writeUInt32LE(4097, 4 + hugeCount.readUInt32LE(0)); assert.throws(() => parseVorbisCommentBlock(hugeCount));
});
test("small fixture-only FLAC metadata rewrite preserves all audio bytes, block flags and existing tags", () => {
  const body = block(["TITLE=Canonical"]), header = Buffer.alloc(4), audio = Buffer.from("unchanged-frame-bytes"); header[0] = 0x84; header.writeUIntBE(body.length, 1, 3);
  const source = Buffer.concat([Buffer.from("fLaC"), header, body, audio]);
  const output = appendFlacFixtureComments(source, ["CUSTOM_REPEAT=one", "CUSTOM_REPEAT=two"]);
  assert.equal(output[4], 0x84); const end = 8 + output.readUIntBE(5, 3);
  assert.deepEqual(output.subarray(end), audio); assert.deepEqual(parseVorbisCommentBlock(output.subarray(8, end)).entries, ["TITLE=Canonical", "CUSTOM_REPEAT=one", "CUSTOM_REPEAT=two"]);
  assert.throws(() => appendFlacFixtureComments(Buffer.alloc(1048577), []));
});
test("Ogg page CRC ignores the stored checksum bytes but detects changed framing/payload", () => {
  const p = Buffer.alloc(30); p.write("OggS"); p[26] = 1; p[27] = 2; p.write("ab", 28);
  const crc = oggPageCrc(p); p.writeUInt32LE(crc, 22); assert.equal(oggPageCrc(p), crc);
  p[29] ^= 1; assert.notEqual(oggPageCrc(p), crc);
});
const chunks = async function*(values) { for (const value of values) yield value; };
test("PCM validator compares every sample across arbitrary chunk boundaries, preserving exact digests", async () => {
  const a = Buffer.from([0, 0, 1, 0, 255, 255, 0, 128, 255, 127]);
  const r = await comparePcm16(chunks([a.subarray(0, 1), a.subarray(1, 4), a.subarray(4)]), chunks([a]), { lossless: true });
  assert.equal(r.samples, 5); assert.equal(r.exact, true); assert.equal(r.psnrDb, "infinity"); assert.equal(r.sourceSha256, r.outputSha256);
});
test("PCM validator refuses truncation, empty audio, alignment tricks, quality loss and even one changed lossless sample", async () => {
  const a = Buffer.alloc(2000), near = Buffer.from(a); near.writeInt16LE(1, 100);
  assert.equal((await comparePcm16(chunks([a]), chunks([near]))).exact, false);
  await assert.rejects(comparePcm16(chunks([a]), chunks([near]), { lossless: true }), /Lossless/);
  await assert.rejects(comparePcm16(chunks([a]), chunks([a.subarray(0, 1998)])), /counts differ/);
  await assert.rejects(comparePcm16(chunks([]), chunks([])), /Empty/);
  await assert.rejects(comparePcm16(chunks([Buffer.from([0])]), chunks([Buffer.from([0])])), /partial sample/);
  await assert.rejects(comparePcm16(chunks([a]), chunks([Buffer.alloc(2000, 127)])), /PSNR/);
  await assert.rejects(comparePcm16(chunks([a]), chunks([a]), { maximumSamples: 10 }), /sample bound/);
});
test("finite production gate uses one real page/context, pinned candidate, physical backing and unchanged process formula, not native encoding", async () => {
  const source = await readFile(new URL("../scripts/test-audio-metadata-production-runtime.mjs", import.meta.url), "utf8");
  assert.equal(source.split("chromium.launchPersistentContext(").length - 1, 1); assert.doesNotMatch(source, /browser.newContext\(/);
  assert.match(source, /await auditAudioMetadataArtifact\(process.argv\[2\]\)/);
  assert.match(source, /await verifyOpfsDiskBacking\(page, profile\)/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
  assert.match(source, /file.slice\(offset, offset \+ count\).arrayBuffer\(\)/); assert.doesNotMatch(source, /file.arrayBuffer\(\)/);
  assert.match(source, /actual|production/); assert.match(source, /convert-button.*click\(\)/);
  assert.match(source, /compareNativeAudioPcm\(input, output/);
  assert.match(source, /lossless: conversion.destination === "flac"/);
  assert.match(source, /createLosslessNativeMemoryJournal/); assert.match(source, /complete: false, failure: coverageFailure/);
  assert.match(source, /row.disposableOutputRemoved = true/); assert.match(source, /await runtime.close\(\)/);
  assert.match(source, /publicAcceptance: false/); assert.match(source, /artworkAcceptance: false/);
});
test("quality comparison explicitly exercises existing UI higher setting without replacing automatic or weakening any case", async () => {
  const source = await readFile(new URL("../scripts/test-audio-metadata-production-runtime.mjs", import.meta.url), "utf8");
  assert.match(source, /--compare-vorbis-quality/);
  assert.match(source, /\[\.\.\.AUDIO_METADATA_FIDELITY_CASES, \{ source: "opus", destination: "ogg", quality: "higher" \}\]/);
  assert.match(source, /audio-quality-select.*selectOption\(conversion.quality\)/);
  assert.match(source, /report.cases.every\(c => c.status === "passed-small-private-fidelity-and-metadata-case"\)/);
  assert.doesNotMatch(source, /minimumPsnrDb:\s*(?:[0-5]?\d)(?:\D|$)/);
});
test("remaining repeated-metadata gate selects only five untested cases and verifies each rewritten input has unchanged complete PCM", async () => {
  const source = await readFile(new URL("../scripts/test-audio-metadata-production-runtime.mjs", import.meta.url), "utf8");
  assert.match(source, /--remaining-repeated-audio/);
  assert.match(source, /AUDIO_METADATA_FIDELITY_CASES.slice\(1, 6\).map\(c => \(\{ \.\.\.c, repeated: true \}\)\)/);
  assert.match(source, /appendOggFixtureComments\(bytes, source, AUDIO_REPEATED_COMMENTS\)/);
  assert.match(source, /sourcePcmUnchanged: await compareNativeAudioPcm\(original, repeatedFile, \{ cwd: root, env, lossless: true \}\)/);
  assert.match(source, /report.repeatedFixtures\[conversion.source\]/);
});
