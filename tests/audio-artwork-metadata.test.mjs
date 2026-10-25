import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
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
test("retained real production run proves four exact covers with complete audio/tags and full-tree journal, not broad acceptance", async () => {
  const root = new URL("../", import.meta.url), sha = b => createHash("sha256").update(b).digest("hex");
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-25T02-54-12.283Z-audio-metadata-fidelity-result.json", root)));
  assert.equal(receipt.status, "passed-selected-small-private-cases-not-promotion");
  assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.fullMetadataAcceptance, false);
  assert.equal(receipt.executedHead, "97fd8fa38bbffe4d05e1874e9b53b6945df3f996");
  assert.equal(receipt.artifactManifestSha256, "8c41ff5ae5fc98c4eb9775d2247d0a99f403b3a3501d63c0592f5520e9164f06");
  assert.equal(receipt.cases.length, 4); assert.equal(receipt.memory.incrementalPrivateMiB, 184.71484375);
  assert.equal(receipt.memory.limitMiB, 250); assert.equal(receipt.memory.validSamples, 471); assert.equal(receipt.memory.unavailableSamples, 0);
  assert.ok(receipt.protectedOriginalUnchanged); assert.ok(Object.values(receipt.cleanup).every(Boolean));
  assert.equal(receipt.diskProof.provesThisContextOpfsBacking, true); assert.deepEqual(receipt.network.forbidden, []);
  assert.deepEqual(receipt.failures, []); assert.equal(receipt.losslessJournal.complete, true);
  const archive = await readFile(new URL(receipt.archive.path, root)); assert.equal(sha(archive), receipt.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 1048576 }); assert.equal(raw.length, receipt.archive.restoredBytes);
  assert.equal(sha(raw), receipt.archive.restoredSha256); const report = JSON.parse(raw);
  assert.equal(report.artworkAcceptance, false); assert.equal(report.scalingAcceptance, false); assert.equal(report.headedCoverage, false);
  assert.equal(report.nativeConversionUsed, false); assert.equal(Object.keys(report.artworkFixtures).length, 4);
  for (const [index, row] of receipt.cases.entries()) {
    const conversion = AUDIO_ARTWORK_METADATA_CASES[index], fixture = report.artworkFixtures[conversion.source + "-" + conversion.artwork];
    assert.equal(row.status, "passed-small-private-fidelity-and-metadata-case"); assert.deepEqual(row.failures, []);
    assert.equal(row.tagsPreserved, 25); assert.equal(row.fidelity.samples, 96000); assert.equal(row.fidelity.exact, true);
    assert.equal(row.fidelity.sourceSha256, row.fidelity.outputSha256);
    assert.deepEqual(row.repeatedValues, ["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"]);
    assert.equal(row.artwork.codec, conversion.artwork); assert.equal(row.artwork.independentImageDecode, true);
    assert.deepEqual(row.artwork, fixture.artwork); assert.ok(fixture.sourcePcmUnchanged.exact); assert.ok(row.disposableOutputRemoved);
    const measured = report.cases[index].browserState.metrics;
    for (const count of [measured.maxReadChunkBytes, measured.maxWriteChunkBytes, measured.peakQueuedBytes]) assert.ok(count <= 262144);
    assert.ok(measured.peakPendingOperations <= 1); assert.equal(measured.pendingOperations, 0);
  }
  const journal = await readFile(new URL(receipt.losslessJournal.file, root)); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  const unpacked = gunzipSync(journal, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(unpacked), receipt.losslessJournal.sha256);
  const samples = unpacked.toString().trim().split("\n").map(line => JSON.parse(line).sample);
  assert.equal(samples.length, 471);
  for (const [index, sample] of samples.entries()) {
    assert.equal(sample.sequence, index + 1); assert.equal(sample.sampleError, null);
    assert.equal(sample.privateBytes, sample.processes.reduce((total, p) => total + p.privateBytes, 0));
  }
  const peak = Math.max(...samples.filter(s => s.phase !== "blank").map(s => s.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.ok(report.processCleanup.every(p => p.status === "owned-identity-absent"));
  for (const screenshot of report.screenshots) assert.equal(sha(await readFile(new URL(screenshot.path, root))), screenshot.sha256);
});
