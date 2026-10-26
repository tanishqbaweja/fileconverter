import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { VORBIS_IO_FIXTURE_POLICY } from "../scripts/lib/vorbis-io-fixture.mjs";
import { requiresPersistentVorbisInput } from "../lib/audio-input-policy.ts";
test("new cancellation input crosses actual8MiB reader boundary with real180s stereo512k Opus and fixed finite size", async () => {
  const policy = VORBIS_IO_FIXTURE_POLICY;
  assert.equal(policy.durationSeconds, 180); assert.equal(policy.frames, 8640000); assert.equal(policy.channels, 2);
  assert.equal(requiresPersistentVorbisInput("opus-to-ogg", 33, policy.minimumBytesExclusive + 1), true);
  assert.equal(policy.maximumBytes, 16 * 1048576);
  assert.equal(policy.bytes, 11581819);
  assert.equal(policy.sha256, "245ca17005fb7841cb906393acc513d6c55618f5f57ae091d2662cd3509532f6");
  const source = await readFile("scripts/lib/vorbis-io-fixture.mjs", "utf8");
  assert.match(source, /"-t", "180"/); assert.match(source, /"-b:a", "512k", "-vbr", "off"/);
  assert.match(source, /seed=424242/); assert.match(source, /seed=242424/); assert.match(source, /"-n"/);
  assert.match(source, /windowsHide: true/); assert.match(source, /AUDIO_METADATA_TAGS/); assert.match(source, /source-cancel.opus/);
  assert.match(source, /assert.equal\(sha256, VORBIS_IO_FIXTURE_POLICY.sha256/);
  assert.doesNotMatch(source, /truncate\(|copyFile\(|\.arrayBuffer\(/);
});
test("retained real q7 UI run authenticates actual BYOB cancellation, injected native error, full recovery and unchanged tree accounting", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-26T01-28-48.427Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.status, "passed-selected-small-private-cases-not-promotion");
  assert.equal(receipt.executedHead, "1df4f32836d0fb7a7b5b0f2ccd1030bbd881bf1a");
  assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.fullMetadataAcceptance, false); assert.equal(receipt.sourcePins, 46);
  const archive = await readFile(receipt.archive.path); assert.equal(sha(archive), receipt.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw), [cancel, write, recovery] = report.cases;
  assert.equal(report.vorbisIoRecovery, "passed-three-private-interruption-and-recovery-jobs-not-public-qualification");
  assert.equal(report.nativeConversionUsed, false); assert.equal(report.headedCoverage, false); assert.equal(report.cases.length, 3);
  assert.equal(report.cancellationFixture.bytes, VORBIS_IO_FIXTURE_POLICY.bytes);
  assert.equal(report.cancellationFixture.sha256, VORBIS_IO_FIXTURE_POLICY.sha256);
  assert.equal(report.cancellationFixture.sourceDecode.samples, 17280000); assert.equal(report.cancellationFixture.sourceDecode.exact, true);
  assert.equal(report.cancellationFixture.successfulOutputFidelityAcceptance, false);
  assert.equal(cancel.beforeCancel.jobState, "running"); assert.equal(cancel.beforeCancel.metrics.inputBytes, 655131);
  assert.equal(cancel.beforeCancel.metrics.outputBytes, 147221); assert.equal(cancel.browserState.jobState, "cancelled");
  assert.equal(cancel.actualInputTransport.strategy, "persistent-byob"); assert.equal(cancel.actualInputTransport.explicitBufferAllocations, 1);
  assert.equal(cancel.actualInputTransport.explicitAllocatedBufferBytes, 262144); assert.equal(cancel.actualInputTransport.readCalls, 6);
  assert.equal(cancel.actualInputTransport.peakInFlight, 1); assert.equal(cancel.actualInputTransport.inFlight, 0);
  assert.ok(cancel.byobCancellationProof.actualPersistentReadPath && cancel.byobCancellationProof.workerRecovered);
  for (const row of [cancel, write]) {
    assert.equal(row.status, "passed-private-audio-interruption-case"); assert.equal(row.output, undefined); assert.equal(row.fidelity, undefined);
    assert.deepEqual(row.storageAfter, []); assert.equal(row.interruptionProof.outputAcceptance, false);
    assert.equal(row.interruptionProof.workerRecovered, true); assert.equal(row.browserState.workerStatus, "ready");
  }
  assert.equal(write.browserState.jobState, "error"); assert.match(write.browserState.error, /Audio header write failed: I\/O error/);
  assert.equal(write.interruptionProof.faultModel, "existing-localhost-error-after-real-bounded-write-not-OS-failure");
  assert.equal(recovery.status, "passed-small-private-fidelity-and-metadata-case"); assert.equal(recovery.browserState.jobState, "complete");
  assert.ok(Object.values(recovery.samePageVorbisIoRecovery).every(Boolean)); assert.equal(recovery.samePageVorbisIoRecovery.automaticNativeQualityCode, 3);
  assert.equal(recovery.output.bytes, 11843); assert.equal(recovery.output.sha256, "a7c954b7b54cd9512735f22eb31c442205d80fe88c5c2f93448ac9e0ceb70167");
  assert.equal(recovery.output.probe.streams[0].codec_name, "vorbis"); assert.equal(recovery.output.tags.fields.length, 25);
  assert.deepEqual(recovery.repeatedValues, ["CUSTOM_REPEAT=Premier 音楽", "CUSTOM_REPEAT=Deuxième café"]);
  assert.equal(recovery.fidelity.samples, 96000); assert.equal(recovery.fidelity.minimumPsnrDb, 60); assert.equal(recovery.fidelity.psnrDb, 61.06540502039469);
  assert.equal(recovery.fullIndependentDecode, true); assert.equal(recovery.artwork.independentImageDecode, true);
  assert.equal(recovery.artwork.sha256, "a2c9b09a676abe1df460620135bd1d889ddfb84de2f665b08c95374ec10564f0");
  assert.equal(recovery.physicalValidation.allOutputBytesCompared, true); assert.equal(recovery.physicalValidation.convertedCopyCreated, false);
  for (const row of report.cases) {
    assert.equal(row.actualAutomaticQualityArgument.nativeCode, 3); assert.equal(row.requestedQuality, "automatic");
    assert.equal(row.automaticQualityNoticeVisible, true); assert.equal(row.browserState.metrics.peakWasmMemoryBytes, 33554432);
    assert.equal(row.browserState.metrics.peakPendingOperations, 1); assert.equal(row.disposableOutputRemoved, true);
  }
  assert.equal(receipt.memory.incrementalPrivateMiB, 203.6015625); assert.equal(receipt.memory.validSamples, 462); assert.equal(receipt.memory.unavailableSamples, 1);
  const packedJournal = await readFile(receipt.losslessJournal.file); assert.equal(sha(packedJournal), receipt.losslessJournal.archiveSha256);
  const journal = gunzipSync(packedJournal, { maxOutputLength: 8 * 1048576 }); assert.equal(sha(journal), receipt.losslessJournal.sha256);
  const samples = journal.toString().trim().split("\n").map(line => JSON.parse(line).sample); assert.equal(samples.length, 463);
  const missing = samples.filter(sample => sample.privateBytes === null); assert.equal(missing.length, 1);
  assert.equal(missing[0].rssBytes, null); assert.equal(missing[0].processes, null); assert.ok(missing[0].sampleError);
  const peak = Math.max(...samples.filter(sample => sample.phase !== "blank" && sample.privateBytes !== null).map(sample => sample.privateBytes));
  assert.equal((peak - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.equal(report.memoryObserverOwnership.memoryFormulaChanged, false); assert.equal(report.memoryObserverOwnership.processNameOrSandboxExclusions, false);
  assert.equal(report.screenshots.length, 3); for (const screenshot of report.screenshots) {
    assert.equal(screenshot.headedCoverage, false); assert.equal(sha(await readFile(screenshot.path)), screenshot.sha256);
  }
  assert.equal(report.processCleanup.length, 15); assert.ok(report.processCleanup.every(row => row.status === "owned-identity-absent" && row.noProcessesKilled));
  assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.deepEqual(receipt.network.forbidden, []); assert.equal(receipt.protectedOriginalUnchanged, true);
});
test("real UI gate cancels actual BYOB after payload progress, faults native writer, then validates exact q7 output in the same page", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--vorbis-io-recovery/); assert.match(source, /interruption: "cancel", byobCancellation: true/);
  assert.match(source, /state.metrics\?\.inputBytes > 262144 && state.metrics\?\.outputBytes > 65536/);
  assert.match(source, /validateAudioInterruption\(conversion.interruption, state/); assert.match(source, /transport.inFlight, 0/);
  assert.match(source, /samePageVorbisIoRecovery/); assert.match(source, /actualAutomaticQualityArgument = state.metrics.audioQualityArgument/);
  assert.ok(source.includes("a7c954b7b54cd9512735f22eb31c442205d80fe88c5c2f93448ac9e0ceb70167"));
  assert.match(source, /sourceDecode.samples, 17280000/); assert.match(source, /compareNativeAudioPcm\(input, output/);
  assert.match(source, /active.peak.privateBytes - report.blankBaseline.privateBytes/);
  assert.equal(source.split("chromium.launchPersistentContext(").length - 1, 1);
});
