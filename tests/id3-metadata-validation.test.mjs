import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { decodeId3Synchsafe, parseId3TextFrame, readId3Metadata, validateId3FixtureMetadata,
  ID3_INSPECTION_LIMITS } from "../scripts/lib/id3-metadata-validation.mjs";
import { AUDIO_METADATA_TAGS } from "../scripts/lib/audio-metadata-fidelity-fixture.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { gunzipSync } from "node:zlib";
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
test("source gain diagnosis authenticates the actual fixed LAME release before bounded stdout-only inspection, then removes owned archive", async () => {
  const source = await readFile("scripts/diagnose-pinned-lame-scale.mjs", "utf8"), recipe = await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8");
  const pin = "3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb";
  assert.ok(source.includes(pin) && recipe.includes("LAME_SHA256=" + pin));
  assert.match(source, /assert.equal\(report.archive.sha256, expectedSha256/);
  assert.match(source, /\["-xOf", archive,/); assert.match(source, /bytes <= 8 \* 1048576/);
  assert.match(source, /windowsHide: true/); assert.match(source, /await runtime.close\(\)/);
  assert.match(source, /not browser gain measurement or conversion acceptance/);
  assert.doesNotMatch(source, /"ffmpeg"|"-xzf"|"-xvf"|\.wasm/);
});
test("retained exact-pinned LAME audit establishes preset scaling code without pretending to measure the browser's gain", async () => {
  const receipt = JSON.parse(await readFile("evidence/2026-10-26T02-06-26.597Z-lame-scale-source-audit.json"));
  assert.equal(receipt.status, "exact-pinned-source-inspected-not-browser-cause-proof");
  assert.equal(receipt.archive.sha256, "3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb");
  assert.equal(receipt.archive.bytes, 1496810); assert.equal(receipt.version, "4.0"); assert.equal(receipt.files.length, 3);
  assert.equal(receipt.nativeConversionUsed, false); assert.equal(receipt.engineChanged, false); assert.equal(receipt.publicAcceptance, false);
  const byFile = new Map(receipt.files.map(value => [value.file, value]));
  const preset = byFile.get("libmp3lame/presets.c"), init = byFile.get("libmp3lame/lame.c");
  assert.equal(preset.sha256, "feb47d97b3014e201d52fa75930b02e18c18568caf6b2f9d9bb02a42a0313ec3");
  assert.ok(preset.excerpts.some(value => value.line === 294 && value.text.includes("lame_get_scale(gfp) * abr_switch_map[r].scale")));
  assert.ok(init.excerpts.some(value => value.line === 1057 && value.text.includes("apply_preset(gfp, gfp->VBR_mean_bitrate_kbps, 0)")));
  assert.ok(init.excerpts.some(value => value.line === 2448 && value.text.includes("gfp->scale = 1")));
  assert.equal(receipt.disposableOwnedSourceArchiveRemoved, true); assert.deepEqual(receipt.failures, []);
  assert.equal(createHash("sha256").update(await readFile("scripts/diagnose-pinned-lame-scale.mjs")).digest("hex"), receipt.scriptSha256);
});
test("first six actual MP3 jobs stay FAILED on47dB audio, despite passing raw25-tag/artwork/bounded-memory/cleanup evidence", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-26T01-58-30.005Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.status, "failed"); assert.equal(receipt.executedHead, "03faecc74a676e1759a5b6d3e8f9f80275f84b35");
  assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.fullMetadataAcceptance, false); assert.equal(receipt.sourcePins, 48);
  const packed = await readFile(receipt.archive.path); assert.equal(sha(packed), receipt.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw); assert.equal(report.cases.length, 6); assert.equal(report.nativeConversionUsed, false); assert.equal(report.headedCoverage, false);
  const hashes = ["4710ff605bb185db713b003a3b985ced3094dde4ea0c4a01c81501f33571dcaf", "3380881cd83a4b8bba8808963a66d8e6edb05c40a10e3a337681cf3a06e25324",
    "cc67fdf33c7f73063a29cec98ffec0f0b7f8a8e9e3f874419cd1457cc00d2e3e", "f323fe4db2441aa5cc76396aa9cb9bf2f93aa54d0724a052dac081d6c5bbd9eb",
    "68ac4c9f413f2bbeb683118ebc33c476fdea334fbf9aab66955e346d1616f6a5", "b1a0fb5d41106317ea885c8d31d55afa5590e3d73d37c652376ee4198eff81a7"];
  const psnr = [47.085711551628926, 47.04090846376274, 47.083835859393595];
  for (const [index, row] of report.cases.entries()) {
    assert.equal(row.profileId, ["flac-to-mp3", "ogg-to-mp3", "opus-to-mp3"][Math.floor(index / 2)]);
    assert.equal(row.status, "failed"); assert.equal(row.browserState.jobState, "complete"); assert.equal(row.requestedQuality, "automatic");
    assert.equal(row.failures.length, 1); assert.match(row.failures[0], /Audio PSNR.*below60dB/);
    assert.equal(row.output.sha256, hashes[index]); assert.equal(row.output.bytes, index % 2 ? 34113 : 34048);
    assert.equal(row.output.tags.status, "passed"); assert.equal(row.output.tags.fields.length, 25); assert.equal(row.id3Metadata.status, "passed");
    assert.equal(row.id3Metadata.fields.length, 25); assert.equal(row.id3Metadata.artwork.status, "preserved");
    assert.equal(validateId3FixtureMetadata(row.binaryComments, AUDIO_METADATA_TAGS, row.artwork).status, "passed");
    assert.equal(row.binaryComments.format, "id3v2.4.0"); assert.equal(row.binaryComments.frameIds.length, 27);
    assert.equal(row.binaryComments.fixedReusableBufferBytes, 4096); assert.ok(row.binaryComments.maximumReadBytes <= 4096);
    assert.equal(row.binaryComments.readBytes, row.binaryComments.tagBytes + 10); assert.equal(row.binaryComments.audioPayloadRead, false);
    assert.equal(row.artwork.independentImageDecode, true); assert.equal(row.artwork.width, 64); assert.equal(row.artwork.height, 64);
    assert.equal(row.artwork.pictureRole, index % 2 ? "Cover (back)" : "Cover (front)");
    assert.equal(row.fidelity.samples, 96000); assert.equal(row.fidelity.psnrDb, psnr[Math.floor(index / 2)]); assert.equal(row.fidelity.minimumPsnrDb, 60);
    assert.equal(row.fullIndependentDecode, true); assert.equal(row.physicalValidation.convertedCopyCreated, false);
    assert.equal(row.physicalValidation.maximumHostProbeBufferBytes, 4096); assert.equal(row.browserState.metrics.peakWasmMemoryBytes, 33554432);
    assert.equal(row.browserState.metrics.peakPendingOperations, 1); assert.equal(row.disposableOutputRemoved, true);
  }
  for (const fixture of Object.values(report.artworkFixtures)) assert.equal(fixture.sourcePcmUnchanged.exact, true);
  assert.equal(receipt.memory.incrementalPrivateMiB, 201.62109375); assert.equal(receipt.memory.validSamples, 492); assert.equal(receipt.memory.unavailableSamples, 0);
  const journalPacked = await readFile(receipt.losslessJournal.file); assert.equal(sha(journalPacked), receipt.losslessJournal.archiveSha256);
  const journal = gunzipSync(journalPacked, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(journal), receipt.losslessJournal.sha256);
  const samples = journal.toString().trim().split("\n").map(line => JSON.parse(line).sample); assert.equal(samples.length, 492);
  assert.ok(samples.every(sample => sample.privateBytes !== null));
  const peak = Math.max(...samples.filter(sample => sample.phase !== "blank").map(sample => sample.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.equal(report.memoryObserverOwnership.memoryFormulaChanged, false); assert.equal(report.memoryObserverOwnership.processNameOrSandboxExclusions, false);
  assert.equal(report.screenshots.length, 6); for (const screenshot of report.screenshots) assert.equal(sha(await readFile(screenshot.path)), screenshot.sha256);
  assert.equal(report.processCleanup.length, 15); assert.ok(Object.values(receipt.cleanup).every(Boolean));
  assert.deepEqual(receipt.network.forbidden, []); assert.equal(receipt.protectedOriginalUnchanged, true);
});
