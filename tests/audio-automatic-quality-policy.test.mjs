import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { audioQualityCode, automaticVorbisQualityNotice, OPUS_VORBIS_AUTOMATIC_QUALITY_NOTICE,
  resolveAudioQualityArgument } from "../lib/media-conversion-options.ts";
import { mediaNativeArguments } from "../lib/media-native-arguments.ts";
import { conversionProfiles, publicProfilesFor } from "../lib/capability-registry.ts";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

test("only automatic Opus-to-Vorbis native33 uses the previously verified q7 code through the actual ABI", () => {
  assert.deepEqual(resolveAudioQualityArgument("opus-to-ogg", 33, "automatic"),
    { requested: "automatic", nativeCode: 3, automaticPolicy: "opus-to-vorbis-q7" });
  const argument = resolveAudioQualityArgument("opus-to-ogg", 33, "automatic");
  const args = mediaNativeArguments(33, [0, 0, 0], [0, 0, argument.nativeCode], [0, 0, 0, 0, 0], "general-12");
  assert.equal(args.length, 12); assert.equal(args[6], 3); assert.deepEqual(args.slice(0, 6), [33, 0, 0, 0, 0, 0]);
});
test("all explicit qualities, other route/native combinations, and unrelated codec parameters remain unchanged", () => {
  for (const profile of ["opus-to-ogg", "flac-to-ogg", "wav-to-ogg", "ogg-to-opus", "opus-to-flac", "mkv-to-webm", "unknown"]) {
    for (let native = 1; native <= 40; native++) {
      for (const quality of ["automatic", "smaller", "balanced", "higher"]) {
        const actual = resolveAudioQualityArgument(profile, native, quality), changed = profile === "opus-to-ogg" && native === 33 && quality === "automatic";
        assert.equal(actual.nativeCode, changed ? 3 : audioQualityCode(quality));
        assert.equal(actual.automaticPolicy, changed ? "opus-to-vorbis-q7" : null); assert.equal(actual.requested, quality);
      }
    }
  }
});
test("UI discloses the targeted automatic policy and possible size/speed cost without claiming restored source fidelity", async () => {
  assert.equal(automaticVorbisQualityNotice("opus-to-ogg", "automatic"), OPUS_VORBIS_AUTOMATIC_QUALITY_NOTICE);
  assert.match(OPUS_VORBIS_AUTOMATIC_QUALITY_NOTICE, /quality 7/); assert.match(OPUS_VORBIS_AUTOMATIC_QUALITY_NOTICE, /slower.*larger/);
  assert.match(OPUS_VORBIS_AUTOMATIC_QUALITY_NOTICE, /cannot restore source losses/);
  for (const quality of ["smaller", "balanced", "higher"]) assert.equal(automaticVorbisQualityNotice("opus-to-ogg", quality), null);
  assert.equal(automaticVorbisQualityNotice("flac-to-ogg", "automatic"), null);
  const ui = await readFile("app/converter/ConverterApp.tsx", "utf8"), worker = await readFile("workers/media-remux.ts", "utf8");
  assert.match(ui, /data-testid="audio-automatic-quality-notice"/); assert.match(ui, /Automatic \(Vorbis quality 7\)/);
  assert.match(worker, /resolveAudioQualityArgument\(profileId, remuxProfile, audioOptions\?\.quality \?\? "automatic"\)/);
  assert.match(worker, /audioCompressionCode\(audioOptions\?\.compression \?\? "automatic"\), qualityArgument.nativeCode/);
  assert.match(worker, /metrics.audioQualityArgument = qualityArgument/);
  const native = await readFile("media/ffmpeg/within_remux.c", "utf8");
  assert.match(native, /requested_quality == 1 \? 1 : requested_quality == 3 \? 7 : 4/);
});
test("changed automatic route cannot inherit the former q4 public qualification or tested-size claim", () => {
  const profile = conversionProfiles.find(value => value.id === "opus-to-ogg"); assert.ok(profile);
  assert.equal(profile.public, false); assert.equal(profile.automatedTestStatus, "pending"); assert.equal(profile.maxTestedBytes, null);
  assert.equal(publicProfilesFor("opus").some(value => value.id === "opus-to-ogg"), false);
  assert.ok(profile.metadataLimitations.some(value => value.includes("quality 7") && value.includes("pending")));
  assert.equal(conversionProfiles.find(value => value.id === "flac-to-ogg").public, true);
});
test("browser gate requests genuine AUTOMATIC jobs and proves actual call argument, visible disclosure and full control hash", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--vorbis-automatic-quality-repair/);
  assert.match(source, /AUDIO_OGG_ARTWORK_CASES.filter\(value => value.source === "opus"\).map\(value => \(\{ \.\.\.value, quality: "automatic" \}\)\)/);
  assert.match(source, /assert.equal\(state.audioOptions.quality, "automatic"\)/);
  assert.match(source, /assert.deepEqual\(state.metrics.audioQualityArgument, \{ requested: "automatic", nativeCode: 3, automaticPolicy: "opus-to-vorbis-q7" \}\)/);
  assert.match(source, /row.automaticQualityNoticeVisible = true/); assert.match(source, /compareNativeAudioPcm\(input, output/);
  assert.ok(source.includes("4db863292dcd76fbcf364a4986120ac9bc39d155a774d730376128058565f4db"));
});
test("first automatic browser run remains failed on the validation-only small-file precondition, not falsely accepted from terminal state", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-25T10-46-04.322Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.status, "failed"); assert.equal(receipt.cases.length, 4); assert.equal(receipt.publicAcceptance, false);
  const packed = await readFile(receipt.archive.path); assert.equal(sha(packed), receipt.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw); assert.equal(report.automaticVorbisQualityRepaired, "unverified-until-all-four-cases-pass");
  for (const row of report.cases) {
    assert.equal(row.status, "failed"); assert.equal(row.browserState.jobState, "complete"); assert.equal(row.automaticQualityNoticeVisible, true);
    assert.deepEqual(row.actualAutomaticQualityArgument, { requested: "automatic", nativeCode: 3, automaticPolicy: "opus-to-vorbis-q7" });
    assert.match(row.failures[0], /expectedBytes >= 3 \* limits.sampleBytes/);
    assert.ok(row.browserState.metrics.outputBytes > 0 && row.browserState.metrics.outputBytes < 12288);
    assert.equal(row.output, undefined); assert.equal(row.fidelity, undefined); assert.equal(row.disposableOutputRemoved, true);
  }
  assert.equal(receipt.memory.incrementalPrivateMiB, 170.01953125); assert.equal(receipt.memory.validSamples, 462); assert.equal(receipt.memory.unavailableSamples, 0);
  const journal = await readFile(receipt.losslessJournal.file); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  assert.equal(sha(gunzipSync(journal, { maxOutputLength: 8 * 1048576 })), receipt.losslessJournal.sha256);
  assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.equal(receipt.protectedOriginalUnchanged, true);
});
test("real repaired AUTOMATIC outputs pass full PCM/tags/covers and preserve the old q4 failure, with honest whole-tree sample coverage", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-25T10-50-22.365Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.status, "passed-selected-small-private-cases-not-promotion"); assert.equal(receipt.publicAcceptance, false);
  assert.equal(receipt.fullMetadataAcceptance, false); assert.equal(receipt.sourcePins, 42); assert.equal(receipt.cases.length, 4);
  assert.equal(receipt.archive.sha256, "01b29270e885ab36fe675ec5d2a80fbd861a388bfd125af8d10a143b3309938f");
  const packed = await readFile(receipt.archive.path); assert.equal(sha(packed), receipt.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw);
  assert.equal(report.automaticVorbisQualityRepaired, "passed-four-small-private-automatic-cases-not-public-requalification");
  assert.equal(report.nativeConversionUsed, false); assert.equal(report.headedCoverage, false);
  const hashes = ["4db863292dcd76fbcf364a4986120ac9bc39d155a774d730376128058565f4db", "c0e924870c0e203ab21c3ea19c1b037109a0d08e6afe472b144a4c34c1a32e6c",
    "a7c954b7b54cd9512735f22eb31c442205d80fe88c5c2f93448ac9e0ceb70167", "0f01fcdc37070b8ceda7c19bc141a871e1e3e0f5cb52209325e2adfd2dc74a7c"];
  for (const [index, row] of report.cases.entries()) {
    assert.equal(row.status, "passed-small-private-fidelity-and-metadata-case"); assert.equal(row.requestedQuality, "automatic");
    assert.equal(row.automaticQualityNoticeVisible, true); assert.equal(row.browserState.audioOptions.quality, "automatic");
    assert.deepEqual(row.actualAutomaticQualityArgument, { requested: "automatic", nativeCode: 3, automaticPolicy: "opus-to-vorbis-q7" });
    assert.equal(row.output.sha256, hashes[index]); assert.equal(row.output.tags.status, "passed"); assert.equal(row.output.tags.fields.length, 25);
    assert.equal(row.fidelity.samples, 96000); assert.equal(row.fidelity.minimumPsnrDb, 60); assert.equal(row.fidelity.psnrDb, 61.06540502039469);
    assert.equal(row.fidelity.outputSha256, "422a6ab44fdf0c223250f00fe76ce21c72e8a317f32a310812086f47419f777f");
    assert.equal(row.physicalValidation.allOutputBytesCompared, true); assert.equal(row.physicalValidation.totalBrowserSampleBytes, row.output.bytes);
    assert.equal(row.physicalValidation.maximumBrowserSampleBytes, 4096); assert.equal(row.physicalValidation.convertedCopyCreated, false);
    assert.equal(row.fullIndependentDecode, true); assert.equal(row.disposableOutputRemoved, true);
    const metrics = row.browserState.metrics; assert.equal(metrics.peakWasmMemoryBytes, 33554432);
    assert.ok(metrics.maxReadChunkBytes <= 262144 && metrics.maxWriteChunkBytes <= 262144 && metrics.peakQueuedBytes <= 262144);
    assert.equal(metrics.pendingOperations, 0); assert.equal(metrics.queuedBytes, 0); assert.ok(metrics.peakPendingOperations <= 1);
    if (index) assert.deepEqual(row.repeatedValues, ["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"]);
    if (index >= 2) { assert.equal(row.artwork.status, "passed-exact-cover-packet"); assert.equal(row.artwork.independentImageDecode, true); }
  }
  const old = JSON.parse(await readFile("evidence/2026-10-24T14-59-06.074Z-audio-metadata-fidelity-result.json"));
  assert.equal(old.status, "failed");
  const oldPacked = await readFile(old.archive.path); assert.equal(sha(oldPacked), old.archive.sha256);
  const oldRaw = gunzipSync(oldPacked, { maxOutputLength: 1048576 }); assert.equal(sha(oldRaw), old.archive.restoredSha256);
  const oldReport = JSON.parse(oldRaw), failed = oldReport.cases.find(row => row.name === "opus-to-ogg"), higher = oldReport.cases.find(row => row.name === "opus-to-ogg-higher");
  assert.equal(failed.status, "failed"); assert.ok(failed.fidelity.psnrDb < 60); assert.equal(failed.requestedQuality, "automatic");
  assert.equal(higher.requestedQuality, "higher"); assert.equal(higher.output.sha256, report.cases[0].output.sha256);
  assert.equal(higher.fidelity.outputSha256, report.cases[0].fidelity.outputSha256);
  assert.equal(receipt.memory.incrementalPrivateMiB, 189.8671875); assert.equal(receipt.memory.validSamples, 411); assert.equal(receipt.memory.unavailableSamples, 1);
  const journal = await readFile(receipt.losslessJournal.file); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  const decoded = gunzipSync(journal, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(decoded), receipt.losslessJournal.sha256);
  const samples = decoded.toString().trim().split("\n").map(line => JSON.parse(line).sample); assert.equal(samples.length, 412);
  const unavailable = samples.filter(row => row.privateBytes === null); assert.equal(unavailable.length, 1);
  assert.equal(unavailable[0].phase, "loaded"); assert.equal(unavailable[0].rssBytes, null); assert.equal(unavailable[0].processes, null); assert.ok(unavailable[0].sampleError);
  const peak = Math.max(...samples.filter(row => row.phase !== "blank" && row.privateBytes !== null).map(row => row.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.equal(report.processCleanup.length, 15); assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.deepEqual(receipt.network.forbidden, []); assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.equal(receipt.protectedOriginalUnchanged, true);
  assert.equal(report.screenshots.length, 4);
  for (const screenshot of report.screenshots) { assert.equal(screenshot.headedCoverage, false); assert.equal(sha(await readFile(screenshot.path)), screenshot.sha256); }
});
