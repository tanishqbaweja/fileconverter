import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { gunzipSync } from "node:zlib";
import { validateAudioInterruption } from "../scripts/lib/audio-io-recovery-validation.mjs";

test("MP3 recovery selects exactly three new real jobs without replaying the metadata matrix or full-scale gate", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  const start = source.indexOf("const selectedCases = "), end = source.indexOf(";\nconst root =", start);
  assert.ok(start > 0 && end > start);
  const expression = source.slice(start + "const selectedCases = ".length, end);
  const cases = JSON.parse(JSON.stringify(runInNewContext("(" + expression + ")",
    { mp3GainMatrix: false, mp3Clipping: false, mp3IoRecovery: true }, { timeout: 1000 })));
  assert.deepEqual(cases, [
    { source: "flac", destination: "mp3", interruption: "cancel", payloadCancellation: true },
    { source: "flac", destination: "mp3", artwork: "png", interruption: "write" },
    { source: "flac", destination: "mp3", artwork: "png", gainRepair: true, recoveryAfterIo: true },
  ]);
  assert.ok(cases.every(row => !row.repeated && !row.highAmplitude));
});
test("MP3 recovery retains genuine audio progress, real production fault path and exact known-control full-PCM/ID3 recovery", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /"--mp3-io-recovery"/);
  assert.match(source, /const mp3GainRepair = [^\n]+\|\| mp3IoRecovery/);
  assert.match(source, /if \(audioIoRecovery \|\| mp3IoRecovery \|\| realQuotaRecovery\)/);
  assert.match(source, /duration=180/);
  assert.match(source, /if \(conversion.payloadCancellation\) await page.waitForFunction/);
  assert.match(source, /state.metrics\?\.inputBytes > 262144 && state.metrics\?\.outputBytes > 65536/);
  assert.match(source, /row.beforeCancel.metrics.inputBytes > 262144 && row.beforeCancel.metrics.outputBytes > 65536/);
  assert.match(source, /getByRole\("button", \{ name: "Cancel safely", exact: true \}\).click\(\)/);
  assert.match(source, /audioIoRecovery \|\| vorbisIoRecovery \|\| mp3IoRecovery\) await page.evaluate/);
  assert.match(source, /history.replaceState\(null, "", "\/\?test=1" \+ \(fault \? "&fault=write" : ""\)\)/);
  assert.match(source, /validateAudioInterruption\(conversion.interruption, state/);
  assert.match(source, /row.output.sha256, "fd3c70154c11380dd727bd1e7b94d2a530b16deffa30aab36c012e5abcdae293"/);
  assert.match(source, /assert.equal\(row.id3Metadata.status, "passed"\); assert.ok\(row.repairedGainProof.fullPcmQualityPassed\)/);
  assert.match(source, /row.fidelity.minimumPsnrDb, 60/);
  assert.match(source, /Math.abs\(gain.leastSquaresGain - 1\) <= 0.001/);
  assert.match(source, /bothInterruptionsPassed: true, noContextOrPageRecreation: true, noStaleErrorOrWarning: true/);
  assert.match(source, /automaticNativeQualityCode: 0, clippingAcceptance: false, publicAcceptance: false/);
  assert.equal(source.split("chromium.launchPersistentContext(").length - 1, 1);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
  assert.match(source, /assert.ok\(report.memory.incrementalPrivateMiB <= 250\)/);
  assert.match(source, /await runtime.close\(\)/);
});

test("retained actual MP3 run proves payload cancellation, injected mux-write error and exact same-page recovery without clipping acceptance", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-26T08-41-16.887Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.executedHead, "7077dcb44d7723740bce9484786fd23c0b53fbc4");
  assert.equal(receipt.status, "passed-selected-small-private-cases-not-promotion");
  assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.fullMetadataAcceptance, false);
  assert.equal(receipt.sourcePins, 50); assert.equal(receipt.artifactManifestSha256, "0af075248ab4515bf8b3aeab542e95478f71618b9060fc5affcd67dad101cd44");
  const packed = await readFile(receipt.archive.path); assert.equal(packed.length, receipt.archive.bytes); assert.equal(sha(packed), receipt.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 1048576 }); assert.equal(raw.length, receipt.archive.restoredBytes); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw), [cancel, failure, recovery] = report.cases;
  assert.equal(report.cases.length, 3); assert.equal(report.nativeConversionUsed, false); assert.equal(report.headedCoverage, false); assert.equal(report.scalingAcceptance, false);
  assert.equal(report.cancellationFixture.bytes, 2539419);
  assert.equal(report.cancellationFixture.sha256, "3e2067ab55bda2f47c485545684522b5ee559f4d9bbf945c112b5d6f57e217ee");
  assert.equal(report.cancellationFixture.durationSeconds, 180); assert.equal(report.cancellationFixture.independentlyDecodedInput, true);
  assert.equal(cancel.beforeCancel.metrics.inputBytes, 524288); assert.equal(cancel.beforeCancel.metrics.outputBytes, 348321);
  assert.equal(cancel.payloadCancellationProof.moreThanHeaderReadAndWritten, true);
  for (const row of [cancel, failure]) {
    assert.equal(row.profileId, "flac-to-mp3"); assert.equal(row.status, "passed-private-audio-interruption-case");
    assert.deepEqual(validateAudioInterruption(row.interruption, row.browserState,
      { beforeCancel: row.beforeCancel, storageBefore: row.storageBefore, storageAfter: row.storageAfter }), row.interruptionProof);
    assert.deepEqual(row.storageAfter, []); assert.equal(row.browserState.metrics.peakWasmMemoryBytes, 33554432);
    assert.equal(row.browserState.metrics.audioQualityArgument.nativeCode, 0);
  }
  assert.equal(failure.browserState.metrics.maxWriteChunkBytes, 791); assert.equal(failure.browserState.metrics.peakQueuedBytes, 791);
  assert.equal(failure.browserState.metrics.outputBytes, 0); assert.equal(failure.interruptionErrorVisible, true);
  assert.match(failure.browserState.error, /destination rejected a bounded write.*Audio frame encode or mux failed: I\/O error/);
  assert.equal(recovery.status, "passed-small-private-fidelity-and-metadata-case");
  assert.equal(recovery.output.bytes, 34048); assert.equal(recovery.output.sha256, "fd3c70154c11380dd727bd1e7b94d2a530b16deffa30aab36c012e5abcdae293");
  assert.equal(recovery.fidelity.samples, 96000); assert.equal(recovery.fidelity.minimumPsnrDb, 60); assert.equal(recovery.fidelity.psnrDb, 97.06231660800464);
  assert.equal(recovery.gainDiagnostic.leastSquaresGain, 0.9999563764707323); assert.equal(recovery.gainDiagnostic.audioNormalized, false);
  assert.equal(recovery.id3Metadata.status, "passed"); assert.equal(recovery.id3Metadata.fields.length, 25); assert.equal(recovery.id3Metadata.artwork.status, "preserved");
  assert.deepEqual(recovery.samePageIoRecovery, { bothInterruptionsPassed: true, noContextOrPageRecreation: true, noStaleErrorOrWarning: true });
  assert.equal(recovery.samePageMp3IoRecovery.payloadCancellationAndWriteFailurePassed, true);
  assert.equal(recovery.samePageMp3IoRecovery.clippingAcceptance, false); assert.equal(recovery.samePageMp3IoRecovery.publicAcceptance, false);
  assert.equal(recovery.browserState.error, null); assert.deepEqual(recovery.browserState.warnings, []);
  assert.ok(report.cases.every(row => row.disposableOutputRemoved)); assert.equal(report.processCleanup.length, 15);
  assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent"));
  assert.equal(receipt.protectedOriginalUnchanged, true); assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.deepEqual(receipt.network.forbidden, []);
  assert.equal(receipt.memory.incrementalPrivateMiB, 198.96484375); assert.equal(receipt.memory.validSamples, 466); assert.equal(receipt.memory.unavailableSamples, 0);
  const journal = await readFile(receipt.losslessJournal.file); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  const samples = gunzipSync(journal, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(samples), receipt.losslessJournal.sha256);
  const history = samples.toString("utf8").trim().split("\n").map(line => JSON.parse(line).sample); assert.equal(history.length, 466);
  const peak = Math.max(...history.filter(sample => sample.phase !== "blank" && sample.privateBytes !== null).map(sample => sample.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.equal(report.screenshots.length, 3);
  for (const screenshot of report.screenshots) {
    assert.equal(screenshot.headedCoverage, false); const bytes = await readFile(screenshot.path);
    assert.equal(bytes.length, screenshot.bytes); assert.equal(sha(bytes), screenshot.sha256);
  }
  const clipping = JSON.parse(await readFile("evidence/2026-10-26T08-27-17.345Z-audio-metadata-fidelity-result.json"));
  assert.equal(clipping.status, "failed"); // Recovery does not repair the independently measured clipping defect.
});
