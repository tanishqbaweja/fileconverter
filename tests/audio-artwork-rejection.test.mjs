import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inflateSync, gunzipSync } from "node:zlib";
import { makeOnePixelTooWidePng, makeOneByteOversizedPng } from "../scripts/lib/audio-artwork-rejection-fixture.mjs";
import { ARTWORK_BUDGET_EXCLUSION_WARNING as warning, validateGeneratedRejectedArtwork, validateArtworkBudgetExclusion } from "../scripts/lib/audio-artwork-rejection-validation.mjs";
const sha = b => createHash("sha256").update(b).digest("hex");
const expected = { codec: "png", width: 1023, height: 1023, bytes: 4194305, sha256: "a".repeat(64), rgbaSha256: "b".repeat(64),
  pictureRole: "Cover (front)", description: "café 音楽", rejectionBoundary: "byte" };
const probe = e => ({ streams: [{ index: 0, codec_type: "audio" }, { index: 1, codec_type: "video", codec_name: "png", width: e.width, height: e.height,
  disposition: { attached_pic: 1 }, tags: { comment: e.pictureRole, title: e.description } }] });
const packets = e => ({ packets: [{ stream_index: 1, size: String(e.bytes), data_hash: "SHA256:" + e.sha256 }] });
test("generated width-overflow input has real4097x1 PNG pixels, valid independent CRCs and no oversized decode", () => {
  const fixture = makeOnePixelTooWidePng(); assert.equal(fixture.width, 4097); assert.equal(fixture.height, 1); assert.ok(fixture.image.length < 65536);
  assert.equal(fixture.image.subarray(0, 8).toString("hex"), "89504e470d0a1a0a"); let at = 8, decoded;
  const kinds = [];
  while (at < fixture.image.length) {
    const n = fixture.image.readUInt32BE(at), kind = fixture.image.subarray(at + 4, at + 8).toString(), body = fixture.image.subarray(at + 4, at + 8 + n);
    let crc = 0xffffffff; for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    assert.equal((crc ^ 0xffffffff) >>> 0, fixture.image.readUInt32BE(at + 8 + n));
    if (kind === "IHDR") { assert.equal(fixture.image.readUInt32BE(at + 8), 4097); assert.equal(fixture.image.readUInt32BE(at + 12), 1); }
    if (kind === "IDAT") decoded = inflateSync(fixture.image.subarray(at + 8, at + 8 + n), { maxOutputLength: 16389 });
    kinds.push(kind); at += 12 + n;
  }
  assert.deepEqual(kinds, ["IHDR", "IDAT", "IEND"]); assert.equal(at, fixture.image.length);
  assert.equal(decoded.length, 16389); assert.equal(decoded[0], 0); assert.equal(sha(decoded.subarray(1)), fixture.rgbaSha256);
});
test("byte-overflow constructor accepts only the independently validated4MiB input, not unknown media or arbitrary sizes", () => {
  assert.throws(() => makeOneByteOversizedPng(Buffer.alloc(4194305)));
  assert.throws(() => makeOneByteOversizedPng(Buffer.alloc(4194304)));
});
test("out-of-policy input inspection cannot certify an output or widen any converter acceptance threshold", () => {
  const result = validateGeneratedRejectedArtwork(probe(expected), packets(expected), expected);
  assert.equal(result.status, "verified-generated-out-of-budget-input-not-output-acceptance"); assert.equal(result.publicAcceptance, false);
  const spoofed = validateGeneratedRejectedArtwork(probe(expected), packets(expected), { ...expected, status: "passed-output", publicAcceptance: true });
  assert.equal(spoofed.status, result.status); assert.equal(spoofed.publicAcceptance, false);
  const wide = { ...expected, width: 4097, height: 1, bytes: 16469, rejectionBoundary: "dimension" };
  assert.equal(validateGeneratedRejectedArtwork(probe(wide), packets(wide), wide).publicAcceptance, false);
  for (const changed of [{ ...expected, bytes: 4194306 }, { ...expected, width: 1024 }, { ...wide, width: 4098 },
    { ...wide, bytes: 65536 }, { ...expected, rejectionBoundary: "other" }, { ...expected, codec: "gif" }])
    assert.throws(() => validateGeneratedRejectedArtwork(probe(changed), packets(changed), changed));
  const missing = probe(expected); missing.streams.pop(); assert.throws(() => validateGeneratedRejectedArtwork(missing, packets(expected), expected));
  const corrupt = packets(expected); corrupt.packets[0].data_hash = "SHA256:" + "c".repeat(64);
  assert.throws(() => validateGeneratedRejectedArtwork(probe(expected), corrupt, expected));
});
test("exclusion requires exactly audio only, no hidden picture comments, and the exact limit warning", () => {
  const audio = { streams: [{ index: 0, codec_type: "audio" }] }, comments = { pictures: [], entries: ["TITLE=preserved"] };
  assert.equal(validateArtworkBudgetExclusion(audio, comments, [warning]).status, "passed-explicit-artwork-budget-exclusion");
  assert.throws(() => validateArtworkBudgetExclusion(audio, comments, ["a generic warning"]));
  assert.throws(() => validateArtworkBudgetExclusion(audio, { ...comments, pictures: [{}] }, [warning]));
  assert.throws(() => validateArtworkBudgetExclusion(audio, { ...comments, entries: ["METADATA_BLOCK_PICTURE=covert"] }, [warning]));
  assert.throws(() => validateArtworkBudgetExclusion(probe(expected), comments, [warning]));
});
test("same-page browser sequence verifies two real exclusions, visible warnings, full fidelity and a non-stale accepted recovery", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--artwork-rejection-recovery/);
  assert.match(source, /artwork: "png-over-bytes", expectedExclusion: true/); assert.match(source, /artwork: "png-over-dimension", expectedExclusion: true/);
  assert.match(source, /artwork: "png-budget", recoveryAfterExclusions: true/);
  assert.equal(source.split("chromium.launchPersistentContext(").length - 1, 1);
  assert.match(source, /validateArtworkBudgetExclusion\(outputProbe, comments, state.warnings\)/);
  assert.match(source, /getByText\(ARTWORK_BUDGET_EXCLUSION_WARNING, \{ exact: true \}\).first\(\).isVisible\(\)/);
  assert.match(source, /twoPreviousExclusionsPassed: true, noContextOrPageRecreation: true, noStaleExclusionWarning: true/);
  assert.match(source, /compareNativeAudioPcm\(input, output/); assert.match(source, /row.output.tags = validateScopedAudioTags/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/); assert.match(source, /await runtime.close\(\)/);
});
test("actual limit exclusions and same-page recovery retain all audio/tags, warnings and lossless whole-tree evidence without promotion", async () => {
  const root = new URL("../", import.meta.url);
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-25T03-45-04.486Z-audio-metadata-fidelity-result.json", root)));
  assert.equal(receipt.status, "passed-selected-small-private-cases-not-promotion"); assert.equal(receipt.publicAcceptance, false);
  assert.equal(receipt.fullMetadataAcceptance, false); assert.equal(receipt.cases.length, 3);
  assert.equal(receipt.artifactManifestSha256, "94da3c35e695c4a2b42a4a8cdd863910bbe09b2e9b46d8b66f674d075b3a658c");
  assert.equal(receipt.memory.incrementalPrivateMiB, 195.12890625); assert.equal(receipt.memory.validSamples, 474);
  assert.equal(receipt.memory.unavailableSamples, 0); assert.equal(receipt.losslessJournal.complete, true);
  const archive = await readFile(new URL(receipt.archive.path, root)); assert.equal(sha(archive), receipt.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  assert.equal(raw.length, receipt.archive.restoredBytes); const report = JSON.parse(raw);
  for (const field of ["artworkAcceptance", "scalingAcceptance", "headedCoverage", "nativeConversionUsed"]) assert.equal(report[field], false);
  assert.equal(report.artworkFixtures["flac-png-over-bytes"].artwork.bytes, 4194305);
  assert.equal(report.artworkFixtures["flac-png-over-dimension"].artwork.width, 4097);
  for (const [key, fixture] of Object.entries(report.artworkFixtures)) {
    assert.equal(fixture.sourcePcmUnchanged.exact, true); assert.equal(fixture.artwork.independentImageDecode, true);
    assert.equal(fixture.artwork.rgbaSha256, fixture.artwork.decodedRgbaSha256);
    if (key !== "flac-png-budget") { assert.equal(fixture.artwork.status, "verified-generated-out-of-budget-input-not-output-acceptance"); assert.equal(fixture.artwork.publicAcceptance, false); }
  }
  const baseline = JSON.parse(await readFile(new URL("evidence/2026-10-25T03-32-37.015Z-audio-metadata-fidelity-result.json", root))).cases[0];
  for (const [index, row] of receipt.cases.entries()) {
    assert.equal(row.status, "passed-small-private-fidelity-and-metadata-case"); assert.equal(row.tagsPreserved, 25);
    assert.equal(row.fidelity.samples, 96000); assert.ok(row.fidelity.psnrDb >= 60);
    assert.equal(row.fidelity.sourceSha256, baseline.fidelity.sourceSha256); assert.equal(row.fidelity.outputSha256, baseline.fidelity.outputSha256);
    assert.deepEqual(row.repeatedValues, ["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"]);
    assert.deepEqual(row.failures, []); assert.ok(row.disposableOutputRemoved);
    if (index < 2) {
      assert.equal(row.exclusionWarningVisible, true); assert.equal(row.artworkExclusion.warning, warning); assert.equal(row.artworkExclusion.outputPictures, 0);
      assert.equal(report.cases[index].output.probe.streams.length, 1); assert.deepEqual(report.cases[index].binaryComments.pictures, []);
      assert.equal(row.artwork, undefined); assert.equal(row.outputBytes, 17008);
    } else {
      assert.ok(Object.values(row.samePageRecovery).every(Boolean)); assert.deepEqual(report.cases[index].browserState.warnings, []);
      assert.equal(row.outputSha256, baseline.outputSha256); assert.deepEqual(row.artwork, baseline.artwork);
      assert.equal(row.streamingPictureInspection.completePacketOrImageBufferAllocated, false);
    }
    const metrics = report.cases[index].browserState.metrics; assert.equal(metrics.peakWasmMemoryBytes, 33554432);
    assert.equal(metrics.peakPendingOperations, 1); assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0);
    for (const size of [metrics.maxReadChunkBytes, metrics.maxWriteChunkBytes, metrics.peakQueuedBytes]) assert.ok(size <= 262144);
  }
  assert.equal(receipt.cases[0].outputSha256, receipt.cases[1].outputSha256);
  assert.ok(receipt.protectedOriginalUnchanged); assert.ok(Object.values(receipt.cleanup).every(Boolean));
  assert.equal(receipt.diskProof.provesThisContextOpfsBacking, true); assert.deepEqual(receipt.network.forbidden, []); assert.deepEqual(receipt.failures, []);
  assert.ok(report.processCleanup.every(p => p.status === "owned-identity-absent"));
  const journal = await readFile(new URL(receipt.losslessJournal.file, root)); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  const unpacked = gunzipSync(journal, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(unpacked), receipt.losslessJournal.sha256);
  const samples = unpacked.toString().trim().split("\n").map(line => JSON.parse(line).sample); assert.equal(samples.length, 474);
  for (const [index, sample] of samples.entries()) {
    assert.equal(sample.sequence, index + 1); assert.equal(sample.sampleError, null);
    assert.equal(sample.privateBytes, sample.processes.reduce((n, p) => n + p.privateBytes, 0));
  }
  const peak = Math.max(...samples.filter(s => s.phase !== "blank").map(s => s.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  for (const screenshot of report.screenshots) assert.equal(sha(await readFile(new URL(screenshot.path, root))), screenshot.sha256);
});
