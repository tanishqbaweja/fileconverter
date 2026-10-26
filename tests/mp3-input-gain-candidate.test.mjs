import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";
import { makeMp3InputGainCandidate, MP3_GAIN_PARENT_SHA256, MP3_GAIN_ARCHIVE_SHA256 } from "../media/ffmpeg/mp3-input-gain-candidate.mjs";
import { makeMp3InputGainBuildRecipe } from "../media/ffmpeg/mp3-input-gain-build-recipe.mjs";
import { makeAudioOggArtworkBuildRecipe } from "../media/ffmpeg/audio-ogg-artwork-build-recipe.mjs";
import { makeMp3InputGainBuildWorkflow } from "../scripts/lib/mp3-input-gain-build-workflow.mjs";
import { makeAudioOggArtworkBuildWorkflow } from "../scripts/lib/audio-ogg-artwork-build-workflow.mjs";
import { verifyAudioMetadataCore } from "../scripts/lib/audio-metadata-artifact.mjs";
test("actual retained LAME parent derives the exact compiled one-edit artifact without changing any other source byte", async () => {
  const parent = await readFile("tests/fixtures/lame4-presets-parent.c", "utf8");
  assert.equal(createHash("sha256").update(parent).digest("hex"), MP3_GAIN_PARENT_SHA256);
  const candidate = makeMp3InputGainCandidate(parent, { sourceArchiveSha256: MP3_GAIN_ARCHIVE_SHA256 });
  assert.equal(candidate.generatedSha256, "921360359ed46f12676c6e9ee66f1f9b0d21e3b4e2733e69dc9e3e35aa7102ab");
  assert.equal(candidate.sourceEdits, 1); assert.equal(candidate.bitRateAndQualityUnchanged, true);
  assert.equal(candidate.generated.replace("    /* Within private candidate: retain caller input gain instead of preset attenuation. */\n    (void) abr_switch_map[r].scale;",
    "    lame_set_scale(gfp, lame_get_scale(gfp) * abr_switch_map[r].scale);"), parent);
});
test("private input-gain policy only permits exact checksum-audited LAME4.0 source, never arbitrary parent or dependency versions", async () => {
  const prior = JSON.parse(await readFile("evidence/2026-10-26T02-06-26.597Z-lame-scale-source-audit.json"));
  assert.equal(MP3_GAIN_ARCHIVE_SHA256, prior.archive.sha256);
  assert.equal(MP3_GAIN_PARENT_SHA256, prior.files.find(file => file.file === "libmp3lame/presets.c").sha256);
  assert.throws(() => makeMp3InputGainCandidate("fake", { sourceArchiveSha256: MP3_GAIN_ARCHIVE_SHA256 }));
  assert.throws(() => makeMp3InputGainCandidate("fake", { sourceArchiveSha256: "0".repeat(64) }));
  const source = await readFile("media/ffmpeg/mp3-input-gain-candidate.mjs", "utf8");
  assert.match(source, /lame_set_scale\(gfp, lame_get_scale\(gfp\) \* abr_switch_map\[r\].scale\)/);
  assert.match(source, /generated.replace\(after, before\), source/); assert.match(source, /sourceEdits: 1/);
  assert.match(source, /codecSettingsChanged: true/); assert.match(source, /clippingAcceptance: false/);
});
test("private recipe adds only authenticated LAME prebuild patch; original SDK/codec flags, bounded I/O/heap and metadata wrapper remain exact", async () => {
  const source = await readFile("media/ffmpeg/reproduce-nondocker.sh", "utf8"), base = makeAudioOggArtworkBuildRecipe(source), recipe = makeMp3InputGainBuildRecipe(source);
  const insert = 'node "${SCRIPT_DIR}/make-mp3-input-gain-candidate.mjs" "${BUILD_ROOT}/lame/libmp3lame/presets.c" "${OUTPUT_ROOT}"\n';
  assert.equal(recipe.generated.split(insert).length, 2); assert.equal(recipe.generated.replace(insert, ""), base.generated);
  assert.equal(recipe.codecSettingsChanged, true); assert.equal(recipe.bitRateAndQualityUnchanged, true);
  assert.equal(recipe.memoryLimitsRaised, false); assert.equal(recipe.publicAcceptance, false);
});
test("isolated workflow changes only private builder and retains all three authenticated LAME source artifacts for independent audit", async () => {
  const original = await readFile(".github/workflows/reproduce-ffmpeg-nondocker.yml", "utf8"), base = makeAudioOggArtworkBuildWorkflow(original), workflow = makeMp3InputGainBuildWorkflow(original);
  let reversed = workflow.generated.replace("node media/ffmpeg/build-mp3-input-gain-candidate.mjs", "node media/ffmpeg/build-audio-ogg-artwork-candidate.mjs");
  for (const name of ["lame-presets.parent.c", "lame-presets.input-gain.c", "mp3-input-gain-source.json"])
    reversed = reversed.replace("            work/ffmpeg-nondocker-output/" + name + "\n", "");
  assert.equal(reversed, base.generated); assert.equal(workflow.publicAcceptance, false);
  assert.match(workflow.generated, /retention-days: 1/); assert.match(workflow.generated, /Remove repository-local build data/);
});
test("artifact auditor cannot accept codec-policy changes without exact independent LAME proof, and legacy candidates still require false", () => {
  const candidate = { codecSettingsChanged: true, ioChanged: false, memoryLimitsRaised: false, browserFixVerified: false, publicAcceptance: false };
  assert.throws(() => verifyAudioMetadataCore({ manifest: { engine: "within-remux-private-bounded-audio-metadata", candidate } }), /independently authenticated/);
  assert.throws(() => verifyAudioMetadataCore({ manifest: { engine: "within-remux-private-bounded-audio-metadata",
    lameSourceSha256: MP3_GAIN_ARCHIVE_SHA256, mp3InputGainPolicy: "preserve-caller-input-scale-without-preset-attenuation",
    candidate: { ...candidate, allowedSourceEdits: 10, upstreamLameGainPatch: {} } }, lameParent: "fake", lameCompiled: "fake", lameReceipt: {} }));
});
test("new browser canary demands the actual changed engine, unchanged automatic argument and60dB fullPCM without claiming clipping/matrix acceptance", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--mp3-input-gain-repair/); assert.match(source, /upstreamLameGainPatch\?\.sourceEdits, 1/);
  assert.match(source, /report.artifact.core.codecSettingsChanged, true/);
  assert.match(source, /gainRepair: true/); assert.match(source, /row.repairedGainProof/);
  assert.match(source, /row.fidelity.minimumPsnrDb, 60/); assert.match(source, /actualAutomaticNativeArgument: 0/);
  assert.match(source, /Math.abs\(gain.leastSquaresGain - 1\) <= 0.001/);
  assert.match(source, /clippingAcceptance: false, publicAcceptance: false/);
});
test("remaining matrix executes exactly five new source/cover combinations and excludes the already-passed FLAC PNG canary", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  const start = source.indexOf("const selectedCases = "), end = source.indexOf(";\nconst root =", start);
  assert.ok(start > 0 && end > start); const expression = source.slice(start + "const selectedCases = ".length, end);
  const cases = JSON.parse(JSON.stringify(runInNewContext("(" + expression + ")", { mp3GainMatrix: true }, { timeout: 1000 })));
  assert.deepEqual(cases.map(row => [row.source, row.artwork]), [["flac", "mjpeg"], ["ogg", "png"], ["ogg", "mjpeg"], ["opus", "png"], ["opus", "mjpeg"]]);
  assert.ok(cases.every(row => row.destination === "mp3" && row.gainRepair));
  assert.match(source, /mp3GainMatrix && !selectedCases.some/); assert.match(source, /row.fidelity.sourceSha256, sourcePcm\[conversion.source\]/);
  assert.match(source, /actualAutomaticNativeArgument: 0/); assert.match(source, /row.fidelity.minimumPsnrDb, 60/);
});
test("actual patched browser canary passes97.06dB and restores unity gain with exact25tags/cover under167.90MiB, without promotion", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-26T02-40-50.659Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.executedHead, "28db3a862b4ec254fd546247aaeded6b6d48f4ca"); assert.equal(receipt.status, "passed-selected-small-private-cases-not-promotion");
  assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.fullMetadataAcceptance, false); assert.equal(receipt.cases.length, 1);
  assert.equal(receipt.artifactManifestSha256, "0af075248ab4515bf8b3aeab542e95478f71618b9060fc5affcd67dad101cd44");
  const packed = await readFile(receipt.archive.path); assert.equal(sha(packed), receipt.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw), row = report.cases[0]; assert.equal(row.status, "passed-small-private-fidelity-and-metadata-case"); assert.deepEqual(row.failures, []);
  assert.equal(report.artifact.core.upstreamLameGainPatch.sourceEdits, 1); assert.equal(report.artifact.core.codecSettingsChanged, true);
  assert.equal(Object.keys(report.artifact.buildSourcePins).length, 61); assert.equal(Object.keys(report.artifact.artifactPins).length, 18);
  assert.equal(row.output.bytes, 34048); assert.equal(row.output.sha256, "fd3c70154c11380dd727bd1e7b94d2a530b16deffa30aab36c012e5abcdae293");
  assert.equal(row.output.probe.streams[0].codec_name, "mp3"); assert.equal(row.fidelity.samples, 96000); assert.equal(row.fidelity.minimumPsnrDb, 60);
  assert.equal(row.fidelity.psnrDb, 97.06231660800464); assert.equal(row.fidelity.squaredError, 20274);
  assert.equal(row.fidelity.sourceSha256, "6a56521d7b4572fafeab898fa878678763e4e5228603089c61690f42fc2b8083");
  assert.equal(row.fidelity.outputSha256, "6eaff52b90b396d8e9a8b4ac3a68eeb327e3141a18c5d8dc0dfcb147ef6858ef");
  assert.equal(row.gainDiagnostic.leastSquaresGain, 0.9999563764707323); assert.equal(row.gainDiagnostic.audioNormalized, false);
  assert.equal(row.gainDiagnostic.alignmentApplied, false); assert.equal(row.gainDiagnostic.thresholdChanged, false);
  assert.equal(row.repairedGainProof.fullPcmQualityPassed, true); assert.equal(row.repairedGainProof.gainRestoredWithinOnePartPerThousand, true);
  assert.equal(row.repairedGainProof.clippingAcceptance, false); assert.equal(row.repairedGainProof.publicAcceptance, false);
  assert.equal(row.actualAutomaticQualityArgument.nativeCode, 0); assert.equal(row.requestedQuality, "automatic");
  assert.equal(row.output.tags.fields.length, 25); assert.equal(row.output.tags.status, "passed"); assert.equal(row.id3Metadata.status, "passed");
  assert.equal(row.artwork.sha256, "a2c9b09a676abe1df460620135bd1d889ddfb84de2f665b08c95374ec10564f0"); assert.equal(row.artwork.independentImageDecode, true);
  assert.equal(row.physicalValidation.convertedCopyCreated, false); assert.equal(row.physicalValidation.maximumHostProbeBufferBytes, 4096);
  assert.equal(row.fullIndependentDecode, true); assert.equal(row.disposableOutputRemoved, true); assert.equal(row.browserState.metrics.peakWasmMemoryBytes, 33554432);
  assert.equal(row.browserState.metrics.peakPendingOperations, 1);
  assert.equal(receipt.memory.incrementalPrivateMiB, 167.90234375); assert.equal(receipt.memory.validSamples, 389); assert.equal(receipt.memory.unavailableSamples, 0);
  const jp = await readFile(receipt.losslessJournal.file); assert.equal(sha(jp), receipt.losslessJournal.archiveSha256);
  const journal = gunzipSync(jp, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(journal), receipt.losslessJournal.sha256);
  const samples = journal.toString().trim().split("\n").map(line => JSON.parse(line).sample); assert.equal(samples.length, 389);
  const peak = Math.max(...samples.filter(sample => sample.phase !== "blank" && sample.privateBytes !== null).map(sample => sample.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.equal(report.screenshots.length, 1); assert.equal(sha(await readFile(report.screenshots[0].path)), report.screenshots[0].sha256);
  assert.equal(report.headedCoverage, false); assert.equal(report.nativeConversionUsed, false); assert.equal(report.processCleanup.length, 15);
  assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.equal(receipt.protectedOriginalUnchanged, true); assert.deepEqual(receipt.network.forbidden, []);
});
