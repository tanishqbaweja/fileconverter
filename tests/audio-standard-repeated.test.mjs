import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { STANDARD_AUDIO_REPEAT_FIELDS, STANDARD_AUDIO_SCALAR_TAGS, STANDARD_AUDIO_REPEAT_CASES,
  makeStandardRepeatedAudioFixture, validateStandardRepeatedAudioComments } from "../scripts/lib/audio-standard-repeated-fixture.mjs";
const entries = () => STANDARD_AUDIO_REPEAT_FIELDS.flatMap(field => field.values.map((value, index) => `${field.aliases[index]}=${value}`));
test("four standard alias families retain both real values, separate entries and literal semicolons, not folded probe text", () => {
  assert.equal(Object.keys(STANDARD_AUDIO_SCALAR_TAGS).length, 21); assert.equal(STANDARD_AUDIO_REPEAT_CASES.length, 6);
  assert.equal(new Set(STANDARD_AUDIO_REPEAT_CASES.map(value => `${value.source}-to-${value.destination}`)).size, 6);
  const result = validateStandardRepeatedAudioComments({ entries: entries() }); assert.equal(result.status, "passed");
  assert.equal(result.fields.length, 4); assert.equal(result.semicolonSplittingUsed, false);
  assert.equal(validateStandardRepeatedAudioComments({ entries: entries().map(value => value.replace(/^[^=]+/, key => key.toUpperCase())) }).status, "passed");
  for (const failure of [entries().slice(1), entries().toReversed(), [...entries(), entries()[0]],
    STANDARD_AUDIO_REPEAT_FIELDS.map(field => `${field.aliases[0]}=${field.values.join(";")}`),
    entries().map(value => value.replace("5/12", "5/13"))])
    assert.equal(validateStandardRepeatedAudioComments({ entries: failure }).status, "failed");
});
test("standard-repeat input and inspector reject invalid format, oversized generated data, malformed and unbounded metadata", () => {
  assert.throws(() => makeStandardRepeatedAudioFixture(Buffer.alloc(1048577), "flac"));
  assert.throws(() => makeStandardRepeatedAudioFixture(Buffer.from("fixture"), "mp3"));
  for (const malformed of [null, { entries: ["missing separator"] }, { entries: ["key=bad\0data"] },
    { entries: ["key=" + "x".repeat(4096)] }, { entries: Array(129).fill("key=value") }, { entries: [42] }])
    assert.throws(() => validateStandardRepeatedAudioComments(malformed));
});
test("new browser scope requires all21 scalar plus four repeated fields, full PCM and physical output binding without changing native settings", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--standard-repeated-audio/); assert.match(source, /STANDARD_AUDIO_REPEAT_CASES/);
  assert.match(source, /validateStandardRepeatedAudioComments\(comments\)/);
  assert.match(source, /standardRepeated \? STANDARD_AUDIO_SCALAR_TAGS/);
  assert.match(source, /standardRepeatedValidation.status !== "passed"/);
  assert.match(source, /sourcePcmUnchanged: await compareNativeAudioPcm\(original, file/);
  assert.match(source, /compareNativeAudioPcm\(input, output/); assert.match(source, /physicalValidation = .*standardRepeatedAudio/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
});
test("six retained browser outputs preserve raw standard repetitions and full decoded audio under unchanged209.02MiB tree gate", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-26T01-43-03.703Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.executedHead, "bacd6ddbdcabe272f12b1ded576592f8541f6ec2");
  assert.equal(receipt.status, "passed-selected-small-private-cases-not-promotion");
  assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.fullMetadataAcceptance, false); assert.equal(receipt.sourcePins, 47);
  assert.equal(receipt.archive.sha256, "2a957f8b64fd217c6cdcf3baaedee6c77dfb2e051191119f181baabeb69e8127");
  const packed = await readFile(receipt.archive.path); assert.equal(sha(packed), receipt.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw); assert.equal(report.nativeConversionUsed, false); assert.equal(report.headedCoverage, false);
  const inputs = { flac: [37207, "292637c5ed71d6502644558f7ed10e77df97ff8b099ac43ad23ec2557136a8a9"],
    ogg: [8176, "a5c0145d482b2b7a1aa4492b2d65de1e6e9f36bc7814d8eab91608ce33fdf043"],
    opus: [20588, "cf13b3b5563b710330f5747a7679d3d32025f94fdcf2bb63996760677bafd095"] };
  for (const [source, [bytes, hash]] of Object.entries(inputs)) {
    const fixture = report.standardRepeatedFixtures[source]; assert.equal(fixture.bytes, bytes); assert.equal(fixture.sha256, hash);
    assert.equal(fixture.repeated.status, "passed"); assert.equal(fixture.sourcePcmUnchanged.exact, true);
    assert.equal(fixture.sourcePcmUnchanged.samples, 96000); assert.equal(fixture.sourcePcmUnchanged.sourceSha256, fixture.sourcePcmUnchanged.outputSha256);
  }
  const outputs = ["0374a390198b86b2fdf55147d259545cc9b0a70516286d67cd075ac5c4ca2205",
    "14471ca2a572af04498ae0e9639f309a475e9ce970fc487b3c2148a44b3f6773",
    "c12a2cc20e933ca49da91099ac300bd1510d11541eee312958316a6d5210de98",
    "97b00863761ddd5887d96bafd91eac5f5804702f5e58b66982f08a482ca5989d",
    "97c06d5ba146de3db41640b589ad0293a03b48163c512cf5ea234208a1251f3e",
    "b1dea5c6dc2c7cd94aab2810fb0593d300030274020367a94a076c25657c6a8a"];
  assert.equal(report.cases.length, 6);
  for (const [index, row] of report.cases.entries()) {
    const expectedCase = STANDARD_AUDIO_REPEAT_CASES[index];
    assert.equal(row.profileId, `${expectedCase.source}-to-${expectedCase.destination}`);
    assert.equal(row.status, "passed-small-private-fidelity-and-metadata-case"); assert.deepEqual(row.failures, []);
    assert.equal(row.output.sha256, outputs[index]); assert.equal(row.output.tags.status, "passed"); assert.equal(row.output.tags.fields.length, 21);
    assert.deepEqual(row.metadataCoverage, { scalarFields: 21, repeatedFields: 4, totalSemanticFields: 25, allFieldsPreserved: true });
    assert.equal(row.standardRepeatedValidation.status, "passed");
    assert.equal(validateStandardRepeatedAudioComments(row.binaryComments).status, "passed");
    assert.equal(row.standardRepeatedValidation.semicolonSplittingUsed, false);
    for (const [fieldIndex, field] of row.standardRepeatedValidation.fields.entries()) {
      assert.equal(field.entries.length, 2); assert.deepEqual(field.entries.map(value => value.value), STANDARD_AUDIO_REPEAT_FIELDS[fieldIndex].values);
    }
    assert.equal(row.fidelity.samples, 96000); assert.equal(row.fullIndependentDecode, true); assert.equal(row.requestedQuality, "automatic");
    if (expectedCase.destination === "flac") { assert.equal(row.fidelity.exact, true); assert.equal(row.fidelity.sourceSha256, row.fidelity.outputSha256); }
    else { assert.equal(row.fidelity.minimumPsnrDb, 60); assert.ok(row.fidelity.psnrDb >= 60); }
    assert.equal(row.physicalValidation.convertedCopyCreated, false); assert.equal(row.physicalValidation.nativeConversionUsed, false);
    assert.equal(row.physicalValidation.maximumHostProbeBufferBytes, 4096); assert.equal(row.physicalValidation.uniquePhysicalMatch, true);
    const metrics = row.browserState.metrics; assert.equal(metrics.peakWasmMemoryBytes, 33554432); assert.equal(metrics.peakPendingOperations, 1);
    assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0);
    for (const count of [metrics.maxReadChunkBytes, metrics.maxWriteChunkBytes, metrics.peakQueuedBytes]) assert.ok(count <= 262144);
    assert.equal(row.disposableOutputRemoved, true);
  }
  assert.equal(report.cases[3].actualAutomaticQualityArgument.nativeCode, 3); assert.equal(report.cases[3].automaticQualityNoticeVisible, true);
  assert.equal(receipt.memory.incrementalPrivateMiB, 209.01953125); assert.equal(receipt.memory.validSamples, 476); assert.equal(receipt.memory.unavailableSamples, 0);
  const journalPacked = await readFile(receipt.losslessJournal.file); assert.equal(sha(journalPacked), receipt.losslessJournal.archiveSha256);
  const decoded = gunzipSync(journalPacked, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(decoded), receipt.losslessJournal.sha256);
  const samples = decoded.toString().trim().split("\n").map(line => JSON.parse(line).sample); assert.equal(samples.length, 476);
  assert.ok(samples.every(sample => sample.privateBytes !== null));
  const peak = Math.max(...samples.filter(sample => sample.phase !== "blank").map(sample => sample.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.equal(report.memoryObserverOwnership.memoryFormulaChanged, false); assert.equal(report.memoryObserverOwnership.processNameOrSandboxExclusions, false);
  assert.equal(report.screenshots.length, 6); for (const screenshot of report.screenshots) {
    assert.equal(screenshot.headedCoverage, false); assert.equal(sha(await readFile(screenshot.path)), screenshot.sha256);
  }
  assert.equal(report.processCleanup.length, 16); assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent" && row.noProcessesKilled));
  assert.deepEqual(receipt.network.forbidden, []); assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.equal(receipt.protectedOriginalUnchanged, true);
});
