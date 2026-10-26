import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectFloat32Peaks, validateNearFullScalePeaks, FLOAT_PEAK_LIMITS } from "../scripts/lib/audio-float-peak-validation.mjs";
import { MP3_CLIPPING_CASES } from "../scripts/lib/mp3-clipping-fixture.mjs";
const floats = values => { const bytes = Buffer.alloc(values.length * 4); values.forEach((value, index) => bytes.writeFloatLE(value, index * 4)); return bytes; };
const chunks = async function*(bytes, step = 3) { for (let at = 0; at < bytes.length; at += step) yield bytes.subarray(at, at + step); };
test("float inspector consumes every sample across arbitrary byte boundaries with exact hash and separate channel peaks", async () => {
  const bytes = floats([0.99, -0.999, -0.99, 0.999]); const result = await inspectFloat32Peaks(chunks(bytes), { channels: 2, expectedFrames: 2 });
  assert.equal(result.samples, 4); assert.equal(result.sha256, createHash("sha256").update(bytes).digest("hex"));
  assert.equal(result.perChannel[0].samples, 2); assert.ok(result.perChannel[0].peakAbsolute > 0.98 && result.perChannel[0].peakAbsolute < 1);
  assert.ok(result.perChannel[1].peakAbsolute > 0.998 && result.perChannel[1].peakAbsolute < 1);
  assert.equal(result.beyondFullScale, 0); assert.equal(result.atFullScale, 0); assert.equal(result.carryBufferBytes, 4);
  assert.equal(result.maximumInputChunkBytes, 3); assert.equal(result.fullDecodedBufferAllocated, false);
  assert.equal(validateNearFullScalePeaks(result, result).status, "passed");
});
test("even one float ULP beyond1, exact saturation, a preclipped source or a quiet substitute cannot pass the near-full-scale gate", async () => {
  const inspect = values => inspectFloat32Peaks(chunks(floats(values)), { channels: 1, expectedFrames: 2 });
  const source = await inspect([0.999, -0.999]);
  for (const values of [[1.0000001192092896, -0.999], [1, -0.999], [0.999, -1.0000001192092896]]) {
    const output = await inspect(values); assert.equal(validateNearFullScalePeaks(source, output).status, "failed");
  }
  const quiet = await inspect([0.1, -0.1]); assert.equal(validateNearFullScalePeaks(quiet, quiet).status, "failed");
  const clipped = await inspect([1, -1]); assert.equal(validateNearFullScalePeaks(clipped, source).status, "failed");
  assert.throws(() => validateNearFullScalePeaks({ ...source, perChannel: [] }, source));
  assert.throws(() => validateNearFullScalePeaks({ ...source, samples: 0 }, source));
});
test("nonfinite data, partial/truncated/extra samples, excessive channels/frames/chunks all fail without trimming", async () => {
  for (const value of [NaN, Infinity, -Infinity]) await assert.rejects(inspectFloat32Peaks(chunks(floats([value])), { channels: 1, expectedFrames: 1 }));
  await assert.rejects(inspectFloat32Peaks(chunks(Buffer.from([0, 0, 0])), { channels: 1, expectedFrames: 1 }));
  await assert.rejects(inspectFloat32Peaks(chunks(floats([0])), { channels: 1, expectedFrames: 2 }));
  await assert.rejects(inspectFloat32Peaks(chunks(floats([0, 0])), { channels: 1, expectedFrames: 1 }));
  await assert.rejects(inspectFloat32Peaks(chunks(floats([0])), { channels: 3, expectedFrames: 1 }));
  await assert.rejects(inspectFloat32Peaks(chunks(floats([0])), { channels: 2, expectedFrames: FLOAT_PEAK_LIMITS.samples }));
  await assert.rejects(inspectFloat32Peaks(chunks(Buffer.alloc(65537), 65537), { channels: 1, expectedFrames: 1 }));
});
test("four genuine new fixtures use near-full-scale mono/stereo signals and native decoding never hides output with an audio filter", async () => {
  assert.equal(MP3_CLIPPING_CASES.length, 4); assert.deepEqual(MP3_CLIPPING_CASES.map(row => [row.channels, row.amplitude]), [[1, 0.99], [1, 0.999], [2, 0.99], [2, 0.999]]);
  const fixture = await readFile("scripts/lib/mp3-clipping-fixture.mjs", "utf8"), decoder = await readFile("scripts/lib/audio-float-peak-validation.mjs", "utf8");
  assert.match(fixture, /997\*t/); assert.match(fixture, /1433\*t/); assert.match(fixture, /"-n"/); assert.match(fixture, /"-sample_fmt", "s16"/);
  assert.match(decoder, /"pcm_f32le", "-f", "f32le", "pipe:1"/); assert.match(decoder, /windowsHide: true/);
  assert.doesNotMatch(decoder, /"-af"|"-ar"|"-ac"|"-ss"|"-t"|readFile\(/);
});
test("real browser clipping gate uses four new files, actual patched core and complete native float output without replacing strictPCM", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--mp3-fullscale-clipping/); assert.match(source, /mp3Clipping \? MP3_CLIPPING_CASES/);
  assert.match(source, /decodeNativeFloatPeaks\(output,/); assert.match(source, /validateNearFullScalePeaks\(row.source.floatPeaks, row.decodedFloatPeaks\)/);
  assert.match(source, /sourcePcmUnchanged.samples, 96000 \* fixture.channels/);
  assert.match(source, /row.fidelity.samples, 96000 \* \(conversion.channels \?\? 1\)/);
  assert.match(source, /row.fidelity.minimumPsnrDb, 60/); assert.match(source, /if \(mp3Clipping\) continue/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/); assert.match(source, /await runtime.close\(\)/);
});

test("retained near-full-scale browser gate stays failed despite passing integer PCM, tags, artwork and memory", async () => {
  const root = new URL("../", import.meta.url), sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile(new URL("evidence/2026-10-26T08-27-17.345Z-audio-metadata-fidelity-result.json", root)));
  assert.equal(receipt.executedHead, "54374e3487e62c9190579b0436f8a86409e239fd");
  assert.equal(receipt.status, "failed"); assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.fullMetadataAcceptance, false);
  assert.equal(receipt.sourcePins, 50); assert.equal(receipt.memory.incrementalPrivateMiB, 196.60546875);
  assert.equal(receipt.memory.validSamples, 427); assert.equal(receipt.memory.unavailableSamples, 0);
  const archive = await readFile(new URL(receipt.archive.path, root));
  assert.equal(archive.length, receipt.archive.bytes); assert.equal(sha(archive), receipt.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 1048576 });
  assert.equal(raw.length, receipt.archive.restoredBytes); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw); assert.equal(report.nativeConversionUsed, false); assert.equal(report.headedCoverage, false);
  assert.equal(report.scalingAcceptance, false); assert.equal(report.cases.length, 4);
  const peaks = [0.9900926947593689, 1.0007861852645874, 0.9916956424713135, 1.0032424926757812];
  for (const [index, row] of report.cases.entries()) {
    const accepted = receipt.cases[index], fixture = report.clippingFixtures[MP3_CLIPPING_CASES[index].highAmplitude];
    assert.equal(row.profileId, "flac-to-mp3"); assert.equal(row.source.sha256, fixture.sha256);
    assert.equal(fixture.inputOnly, true); assert.equal(fixture.sourcePcmUnchanged.exact, true);
    assert.equal(fixture.sourcePcmUnchanged.samples, 96000 * fixture.channels);
    assert.equal(fixture.floatPeaks.beyondFullScale, 0); assert.equal(fixture.floatPeaks.atFullScale, 0);
    assert.ok(fixture.floatPeaks.perChannel.every(channel => channel.peakAbsolute >= 0.98 && channel.peakAbsolute < 1));
    assert.equal(accepted.decodedFloatPeaks.peakAbsolute, peaks[index]);
    assert.equal(accepted.decodedFloatPeaks.beyondFullScale, [0, 1, 0, 11][index]);
    assert.equal(accepted.decodedFloatPeaks.samples, 96000 * fixture.channels);
    assert.equal(accepted.decodedFloatPeaks.allSamplesInspected, true);
    assert.equal(accepted.decodedFloatPeaks.fullDecodedBufferAllocated, false);
    const proof = validateNearFullScalePeaks(fixture.floatPeaks, row.decodedFloatPeaks);
    assert.deepEqual(proof, row.nearFullScalePeakProof);
    assert.equal(proof.status, index % 2 ? "failed" : "passed"); assert.equal(proof.toleranceAdded, false);
    assert.equal(accepted.status, index % 2 ? "failed" : "passed-small-private-fidelity-and-metadata-case");
    assert.equal(accepted.fidelity.minimumPsnrDb, 60); assert.ok(accepted.fidelity.psnrDb >= 60);
    assert.ok(Math.abs(accepted.gainDiagnostic.leastSquaresGain - 1) <= 0.001);
    assert.equal(accepted.tagsPreserved, 25); assert.equal(accepted.id3Metadata.status, "passed");
    assert.equal(accepted.id3Metadata.artwork.status, "preserved");
    assert.equal(accepted.actualAutomaticQualityArgument.nativeCode, 0);
    assert.equal(accepted.failures.length, index % 2 ? 1 : 0);
    assert.equal(row.disposableOutputRemoved, true);
  }
  assert.equal(report.processCleanup.length, 15); assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.equal(receipt.protectedOriginalUnchanged, true); assert.ok(Object.values(receipt.cleanup).every(Boolean));
  assert.deepEqual(receipt.network.forbidden, []);
  const journal = await readFile(new URL(receipt.losslessJournal.file, root)); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  const samples = gunzipSync(journal, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(samples), receipt.losslessJournal.sha256);
  assert.equal(samples.toString("utf8").trim().split("\n").length, 427);
  for (const screenshot of report.screenshots) {
    assert.equal(screenshot.headedCoverage, false); const bytes = await readFile(new URL(screenshot.path, root));
    assert.equal(bytes.length, screenshot.bytes); assert.equal(sha(bytes), screenshot.sha256);
  }
});
