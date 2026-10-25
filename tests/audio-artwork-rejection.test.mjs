import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inflateSync } from "node:zlib";
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
