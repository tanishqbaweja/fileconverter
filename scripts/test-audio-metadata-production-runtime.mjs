// Finite private candidate qualification in ONE real production page/worker/I/O
// lifecycle. New PCM/duplicate serialization evidence, not native conversion,
// public promotion, full artwork acceptance, repeat stress, or the full project.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, open, readFile, statfs, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { chromium } from "playwright";
import { auditAudioMetadataArtifact } from "./lib/audio-metadata-artifact.mjs";
import { AUDIO_METADATA_TAGS, AUDIO_METADATA_FIDELITY_CASES, AUDIO_REPEATED_COMMENTS, audioMetadataFixtureArguments } from "./lib/audio-metadata-fidelity-fixture.mjs";
import { appendFlacFixtureComments, readAudioCommentEntries } from "./lib/audio-comment-validation.mjs";
import { appendOggFixtureComments } from "./lib/audio-repeated-comment-fixture.mjs";
import { AUDIO_ARTWORK_METADATA_CASES, AUDIO_OGG_ARTWORK_CASES, audioArtworkFixtureComment, audioArtworkFixturePicture, appendFlacArtworkFixture, validateAudioArtworkPacket, validateBudgetedAudioArtworkPacket } from "./lib/audio-artwork-validation.mjs";
import { createAudioArtworkBudgetFixture } from "./lib/audio-artwork-budget-fixture.mjs";
import { createAudioArtworkRejectionFixtures } from "./lib/audio-artwork-rejection-fixture.mjs";
import { ARTWORK_BUDGET_EXCLUSION_WARNING, validateGeneratedRejectedArtwork, validateArtworkBudgetExclusion } from "./lib/audio-artwork-rejection-validation.mjs";
import { readOggPictureComments, readOggNativeTextBudgetComments } from "./lib/ogg-picture-comment-inspection.mjs";
import { validateAudioInterruption } from "./lib/audio-io-recovery-validation.mjs";
import { createAudioMetadataFieldBudgetFixtures } from "./lib/audio-metadata-field-budget-fixture.mjs";
import { validateMetadataFieldBudgetFailure, validateExactMetadataFieldBoundary } from "./lib/audio-metadata-field-budget-validation.mjs";
import { createAudioMetadataByteBudgetFixtures } from "./lib/audio-metadata-byte-budget-fixture.mjs";
import { validateMetadataTextByteBudgetFailure, validateExactNativeTextByteBoundary } from "./lib/audio-metadata-byte-budget-validation.mjs";
import { compareNativeAudioPcm } from "./lib/streaming-audio-fidelity.mjs";
import { validateScopedAudioTags } from "./lib/scoped-audio-tag-validation.mjs";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { queryProcessIdentity, observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
import { startChromiumMemoryMonitor } from "./lib/birth-aware-chromium-memory.mjs";
import { stableWindow } from "./lib/chromium-private-memory.mjs";
import { createLosslessNativeMemoryJournal, compactLosslessNativeMemoryJournal } from "./lib/lossless-native-memory-journal.mjs";
import { installBoundedNetworkObserver } from "./lib/bounded-network-observer.mjs";
import { verifyOpfsDiskBacking } from "./lib/opfs-disk-backing-proof.mjs";
import { bindOpfsOutputValidationBacking, bindLargeAudioOutputValidationBacking, assertOpfsOutputValidationBackingUnchanged } from "./lib/opfs-output-validation-backing.mjs";
import { createVorbisLargeFixture, VORBIS_LARGE_FIXTURE } from "./lib/vorbis-large-fixture.mjs";
import { compareNativeLongAudioPcm } from "./lib/long-audio-fidelity.mjs";
import { createVorbisIoFixture } from "./lib/vorbis-io-fixture.mjs";
import { STANDARD_AUDIO_REPEAT_CASES, STANDARD_AUDIO_SCALAR_TAGS, makeStandardRepeatedAudioFixture, validateStandardRepeatedAudioComments } from "./lib/audio-standard-repeated-fixture.mjs";
import { readId3Metadata, validateId3FixtureMetadata } from "./lib/id3-metadata-validation.mjs";
import { decodeNativeFloatPeaks, validateNearFullScalePeaks } from "./lib/audio-float-peak-validation.mjs";
import { MP3_CLIPPING_CASES, createMp3ClippingFixtures } from "./lib/mp3-clipping-fixture.mjs";
import { encodeBoundedValidationChunk, decodeBoundedValidationChunk } from "./lib/bounded-validation-chunk.mjs";
import { OPUS_VORBIS_AUTOMATIC_QUALITY_NOTICE } from "../lib/media-conversion-options.ts";

assert.ok(process.argv.length === 3 || (process.argv.length === 4 && ["--compare-vorbis-quality", "--remaining-repeated-audio", "--flac-order-repair", "--artwork-metadata", "--ogg-artwork", "--artwork-byte-budget", "--artwork-rejection-recovery", "--audio-io-recovery", "--artwork-serializer-benchmark", "--artwork-benchmark-physical-validation", "--metadata-field-budget-recovery", "--metadata-field-rejection-recovery", "--metadata-text-byte-budget-recovery", "--vorbis-automatic-quality-repair", "--vorbis-large-repeat", "--vorbis-io-recovery", "--standard-repeated-audio", "--mp3-artwork-metadata", "--mp3-gain-diagnostic", "--mp3-input-gain-repair", "--mp3-input-gain-matrix", "--mp3-fullscale-clipping", "--mp3-io-recovery"].includes(process.argv[3])), "Pass the audited candidate and one optional explicit qualification scope");
const mp3IoRecovery = process.argv[3] === "--mp3-io-recovery";
const mp3Clipping = process.argv[3] === "--mp3-fullscale-clipping";
const mp3GainMatrix = process.argv[3] === "--mp3-input-gain-matrix";
const mp3GainRepair = process.argv[3] === "--mp3-input-gain-repair" || mp3GainMatrix || mp3Clipping || mp3IoRecovery;
const mp3GainDiagnostic = process.argv[3] === "--mp3-gain-diagnostic";
const mp3SingleCanary = mp3GainDiagnostic || (mp3GainRepair && !mp3GainMatrix);
const mp3ArtworkMetadata = process.argv[3] === "--mp3-artwork-metadata" || mp3GainRepair || mp3GainDiagnostic;
const standardRepeatedAudio = process.argv[3] === "--standard-repeated-audio";
const vorbisIoRecovery = process.argv[3] === "--vorbis-io-recovery";
const largeVorbisRepeat = process.argv[3] === "--vorbis-large-repeat";
const automaticVorbisRepair = process.argv[3] === "--vorbis-automatic-quality-repair" || largeVorbisRepeat;
const qualityComparison = process.argv[3] === "--compare-vorbis-quality";
const remainingRepeated = process.argv[3] === "--remaining-repeated-audio";
const flacOrderRepair = process.argv[3] === "--flac-order-repair";
const artworkMetadata = process.argv[3] === "--artwork-metadata";
const metadataFieldRejectOnly = process.argv[3] === "--metadata-field-rejection-recovery";
const metadataFieldBudget = process.argv[3] === "--metadata-field-budget-recovery" || metadataFieldRejectOnly;
const metadataByteBudget = process.argv[3] === "--metadata-text-byte-budget-recovery";
const metadataBudget = metadataFieldBudget || metadataByteBudget;
const physicalValidation = process.argv[3] === "--artwork-benchmark-physical-validation" || metadataBudget || automaticVorbisRepair || vorbisIoRecovery || standardRepeatedAudio || mp3ArtworkMetadata;
const artworkBenchmark = process.argv[3] === "--artwork-serializer-benchmark" || process.argv[3] === "--artwork-benchmark-physical-validation";
const artworkBudget = process.argv[3] === "--artwork-byte-budget" || artworkBenchmark || metadataBudget;
const audioIoRecovery = process.argv[3] === "--audio-io-recovery";
const artworkRejection = process.argv[3] === "--artwork-rejection-recovery", extendedArtworkInspection = artworkBudget || artworkRejection || audioIoRecovery;
const oggArtwork = process.argv[3] === "--ogg-artwork" || (automaticVorbisRepair && !largeVorbisRepeat) || vorbisIoRecovery, withArtwork = artworkMetadata || oggArtwork || mp3ArtworkMetadata;
const selectedCases = mp3GainMatrix ? ["flac", "ogg", "opus"].flatMap(source => ["png", "mjpeg"].map(artwork => ({ source, destination: "mp3", artwork, gainRepair: true })))
  .filter(row => !(row.source === "flac" && row.artwork === "png")) : mp3Clipping ? MP3_CLIPPING_CASES : mp3IoRecovery ? [
  { source: "flac", destination: "mp3", interruption: "cancel", payloadCancellation: true },
  { source: "flac", destination: "mp3", artwork: "png", interruption: "write" },
  { source: "flac", destination: "mp3", artwork: "png", gainRepair: true, recoveryAfterIo: true },
] : mp3GainRepair ? [{ source: "flac", destination: "mp3", artwork: "png", gainRepair: true }] : mp3GainDiagnostic ? [{ source: "flac", destination: "mp3", artwork: "png", gainDiagnostic: true }] : mp3ArtworkMetadata ? ["flac", "ogg", "opus"].flatMap(source => ["png", "mjpeg"].map(artwork => ({ source, destination: "mp3", artwork }))) : standardRepeatedAudio ? STANDARD_AUDIO_REPEAT_CASES : vorbisIoRecovery ? [
  { source: "opus", destination: "ogg", interruption: "cancel", byobCancellation: true },
  { source: "opus", destination: "ogg", repeated: true, artwork: "png", interruption: "write" },
  { source: "opus", destination: "ogg", repeated: true, artwork: "png", recoveryAfterIo: true },
] : largeVorbisRepeat ? Array.from({ length: 3 }, (_, repeat) => ({ source: "opus", destination: "ogg", largeStereo: true, repeat })) : automaticVorbisRepair ? [
  { source: "opus", destination: "ogg" }, { source: "opus", destination: "ogg", repeated: true },
  ...AUDIO_OGG_ARTWORK_CASES.filter(value => value.source === "opus").map(value => ({ ...value, quality: "automatic" })),
] : metadataByteBudget ? [
  { source: "flac", destination: "opus", repeated: true, byteBudget: "exact" },
  { source: "flac", destination: "opus", repeated: true, byteBudget: "over", metadataFailure: "text-bytes" },
  { source: "flac", destination: "opus", repeated: true, artwork: "png-budget", recoveryAfterBytes: true },
] : metadataFieldBudget ? [
  { source: "flac", destination: "opus", repeated: true, artwork: "png-budget", fieldBudget: "cover4095" },
  { source: "flac", destination: "opus", repeated: true, artwork: "png-budget", fieldBudget: "cover4096", metadataFailure: "picture-fields" },
  { source: "flac", destination: "opus", repeated: true, fieldBudget: "text4097", metadataFailure: "text-fields" },
  { source: "flac", destination: "opus", repeated: true, artwork: "png-budget", recoveryAfterMetadata: true },
].filter((_, index) => !metadataFieldRejectOnly || index > 0) : audioIoRecovery ? [
  { source: "flac", destination: "opus", interruption: "cancel" },
  { source: "flac", destination: "opus", repeated: true, artwork: "png-budget", interruption: "write" },
  { source: "flac", destination: "opus", repeated: true, artwork: "png-budget", recoveryAfterIo: true },
] : artworkRejection ? [
  { source: "flac", destination: "opus", repeated: true, artwork: "png-over-bytes", expectedExclusion: true },
  { source: "flac", destination: "opus", repeated: true, artwork: "png-over-dimension", expectedExclusion: true },
  { source: "flac", destination: "opus", repeated: true, artwork: "png-budget", recoveryAfterExclusions: true },
] : artworkBenchmark ? Array.from({ length: 7 }, (_, index) => ({ source: "flac", destination: "opus", repeated: true, artwork: "png-budget",
  benchmarkIteration: index, benchmarkWarmup: index === 0 }))
  : artworkBudget ? [{ source: "flac", destination: "opus", repeated: true, artwork: "png-budget" }]
  : oggArtwork ? AUDIO_OGG_ARTWORK_CASES : artworkMetadata ? AUDIO_ARTWORK_METADATA_CASES : flacOrderRepair ? [...AUDIO_METADATA_FIDELITY_CASES.slice(4, 6), ...AUDIO_METADATA_FIDELITY_CASES.slice(4, 6).map(c => ({ ...c, repeated: true }))]
  : remainingRepeated ? AUDIO_METADATA_FIDELITY_CASES.slice(1, 6).map(c => ({ ...c, repeated: true }))
  : qualityComparison ? [...AUDIO_METADATA_FIDELITY_CASES, { source: "opus", destination: "ogg", quality: "higher" }] : AUDIO_METADATA_FIDELITY_CASES;
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), pause = ms => new Promise(r => setTimeout(r, ms));
const runtime = await createOwnedRuntimeScratch("audio-metadata-production-"), env = { ...runtime.env, WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1" };
const report = { schemaVersion: 1, startedAt: new Date().toISOString(), status: "failed-or-incomplete", scope: "seven small private production-UI audio fidelity/tag/duplicate cases in one normal page",
  publicAcceptance: false, fullMetadataAcceptance: false, artworkAcceptance: false, scalingAcceptance: false, headedCoverage: false,
  cases: [], failures: [], network: { observedRequests: 0, forbidden: [], nativeGlueRequests: 0, nativeWasmRequests: 0 }, nativeConversionUsed: false };
if (standardRepeatedAudio) report.scope = "six NEW standard-key duplicate/alias cases: track, comment, album_artist, disc with separate unequal values (including literal semicolon), remaining21 scalar tags and full PCM; same private engine/physical OPFS/full Chrome accounting; not artwork/stress/public qualification";
if (qualityComparison) report.scope += "; plus explicit same-fixture higher-quality Vorbis control (not a default change or speed proof)";
if (remainingRepeated) report.scope = "five NEW repeated-comment route cases, excluding the already-passed FLAC-to-Ogg duplicate gate; not stress or promotion";
if (flacOrderRepair) report.scope = "four FLAC-only changed muxer-order cases: two canonical plus two repeated inputs; not replay of closed Ogg cases or stress acceptance";
if (artworkMetadata) report.scope = "four NEW Ogg/Opus-to-FLAC cases combining 25 tags, ordered repeated values and exact PNG/JPEG covers; not full artwork/budget/stress acceptance";
if (oggArtwork) {
  report.scope = "eight NEW Ogg/Opus destination cover cases with PNG/JPEG, 25 tags and ordered values; Opus-to-Vorbis uses the existing explicit higher selection, not a default-quality repair or speed proof";
  report.automaticVorbisQualityRepaired = false;
}
if (mp3ArtworkMetadata) report.scope = "six NEW private MP3 outputs from FLAC/Vorbis/Opus with25 scalar Unicode tags, PNG/JPEG front/back cover roles/descriptions, raw ID3v2.4 inspection, independent image/full PCM; no duplicate-ID3/stress/direct-picker/public qualification";
if (mp3GainDiagnostic) report.scope = "one NEW instrumented automatic FLAC/PNG-to-MP3 control pinning prior output bytes/PCM/MSE and recording unmodified whole-signal gain/power/cross-product; original60dB failure retained, no normalization/alignment/new engine/public or stress acceptance";
if (mp3GainRepair) report.scope = "one NEW automatic FLAC/PNG-to-MP3 canary using authenticated one-edit private LAME gain policy; unchanged60dB all96000PCM/25tags/exactcover/I/O/fulltree250MiB; not high-amplitude clipping, six-case matrix, stress, speed or public acceptance";
if (mp3GainMatrix) report.scope = "FIVE remaining automatic MP3 gain-repair jobs: FLAC/JPEG plus Vorbis and Opus/PNG/JPEG, excluding closed FLAC/PNG canary; actual patched-core proof, all96000 unmodifiedPCM>=60dB, gain/25tags/rawID3/exactcover/wholeChrome250MiB/cleanup; not clipping/recovery/stress/public acceptance";
if (mp3Clipping) report.scope = "four NEW near-full-scale2s mono/stereo FLAC-to-MP3 cases at0.99/0.999; independent full f32 decode exposes saturation/overshoot before integer clamping, unchanged60dB complete s16 comparison/tags/PNG/memory/cleanup; not every waveform, IO recovery, stress or public acceptance";
if (mp3IoRecovery) report.scope = "three NEW same-page private gain-core MP3 jobs: cancel after real audio payload, injected error after real bounded write, then exact prior PNG/25-tag/full-PCM recovery; existing near-full-scale failures remain failed; not OS/quota/permission/direct-picker/stress/public acceptance";
if (artworkBudget) report.scope = "one NEW exact4MiB real PNG cover FLAC-to-Opus byte-budget case; unchanged text/codec/quality/memory limits; not repeat/scaling/promotion acceptance";
if (artworkBenchmark) {
  report.scope = "matched serializer experiment: one explicit warmup plus six identical exact4MiB-artwork FLAC-to-Opus jobs in one normal headless production page; not long-file/stress/scaling/fastest/public acceptance";
  report.benchmark = { warmupJobs: 1, measuredJobs: 6, warmupExcludedOnlyFromTimingNotCorrectnessOrMemory: true,
    comparisonRequiresSeparateBracketedBaselineAndCandidateRuns: true,
    browserElapsedMetric: "host wall clock from real UI click to observed terminal state",
    engineElapsedMetric: "actual production job metrics.elapsedMs at terminal; not serializer-only CPU time" };
  report.benchmark.validationBackend = physicalValidation ? "unique-byte-bound-physical-OPFS-no-output-copy" : "bounded-CDP-export-copy";
}
if (artworkRejection) report.scope = "three NEW same-page cases: valid one-byte-over/one-pixel-over covers excluded with visible exact warnings, then accepted4MiB recovery; not cancellation/write-failure/full recovery/stress acceptance";
if (audioIoRecovery) report.scope = "three NEW same-page real-UI jobs: midstream180s-fixture cancellation, localhost injected error AFTER real artwork-header write, accepted4MiB recovery; not OS-picker/direct-destination/quota/permission/stress acceptance";
if (metadataFieldBudget) report.scope = "four NEW field-budget jobs: exact4095text+1cover, one-over cover and4097text native rejections, same-page valid recovery; unchanged2MiB/4096 limits, not byte-budget/stress/promotion acceptance";
if (metadataFieldRejectOnly) report.scope = "three changed error-explanation jobs only: native cover/text field rejections and same-page exact recovery; prior exact4096 output not replayed; not byte-budget/stress/public acceptance";
if (metadataByteBudget) report.scope = "three NEW native text-byte jobs: exact2097152 UTF8 key/value+NUL bytes, one-byte-over native rejection, same-page control recovery; serialization overhead separately bounded, historical reader/engine limits unchanged; not stress/public acceptance";
if (automaticVorbisRepair) {
  report.scope = "four NEW automatic Opus-to-Vorbis jobs: canonical/repeated/PNG/JPEG, unchanged60dB full-PCM gate; actual native quality argument3/q7 and visible automatic policy; not a higher-selector control, stress, speed or public requalification";
  report.automaticVorbisQualityRepaired = "unverified-until-all-four-cases-pass";
}
if (largeVorbisRepeat) {
  report.scope = "three NEW same-page full147964541B/2300s stereo-noise automatic q7 jobs; complete unaligned PCM plus unchanged legacy channel-SDR floor; normal complete-Chrome250MiB includes validation/cleanup/all services; no public/IO/cold-repeat/10GB qualification";
  report.automaticVorbisQualityRepaired = "large-repeat-not-yet-qualified";
  report.largeRepeatPlan = { runs: 3, inputBytes: VORBIS_LARGE_FIXTURE.bytes, durationSeconds: 2300, channels: 2,
    expectedFramesPerChannel: 110400000, minimumChannelSdrDb: -6.5, separateSmallToneMinimumPsnrDbUnchanged: 60,
    legacyCleanupDeltaLimitMiB: 96, stopOnFirstFailedConversionOrMemoryExcess: true, publicAcceptance: false };
}
if (vorbisIoRecovery) {
  report.scope = "three NEW automatic-q7 real UI jobs: >8MiB180s stereo BYOB input cancelled after>256KiB input and>64KiB output, existing localhost after-write fault with PNG, same-page exact PNG/25tag/repeat/fullPCM recovery; not OS fault/direct picker/full repeats/public acceptance";
  report.automaticVorbisQualityRepaired = "prior-small-repair-retained-not-retested-as-a-cold-gate";
  report.vorbisIoRecovery = "unverified-until-all-three-cases-pass";
}
const stamp = report.startedAt.replaceAll(":", "-"), sha = b => createHash("sha256").update(b).digest("hex");
const hashFile = async file => { const hash = createHash("sha256"); for await (const b of createReadStream(file, { highWaterMark: 1048576 })) hash.update(b); return hash.digest("hex"); };
const native = (args, executable = "ffmpeg") => execute(executable, args, { cwd: root, env, windowsHide: true, timeout: 30000, maxBuffer: 131072 });
const projectedTags = metadataBudget ? "=" + Object.keys(AUDIO_METADATA_TAGS).join(",") : "";
const probeAudio = async file => JSON.parse((await native(["-v", "error", "-show_entries", "stream=index,codec_type,codec_name,sample_rate,channels,width,height:stream_disposition=attached_pic:stream_tags" + projectedTags + ":format=duration:format_tags" + projectedTags, "-of", "json", file], "ffprobe")).stdout);
const inspectArtwork = async (file, probe, expected, generatedRejectedInput = false) => {
  const packets = JSON.parse((await native(["-v", "error", "-select_streams", "v:0", "-show_packets", "-show_data_hash", "sha256",
    "-show_entries", "packet=stream_index,size,data_hash", "-of", "json", file], "ffprobe")).stdout);
  const result = generatedRejectedInput ? validateGeneratedRejectedArtwork(probe, packets, expected)
    : (extendedArtworkInspection ? validateBudgetedAudioArtworkPacket : validateAudioArtworkPacket)(probe, packets, expected);
  if (expected.rgbaSha256) {
    const decoded = (await native(["-nostdin", "-v", "error", "-xerror", "-i", file, "-map", "0:v:0", "-frames:v", "1",
      "-c:v", "rawvideo", "-pix_fmt", "rgba", "-threads", "1", "-f", "hash", "-hash", "sha256", "-"])).stdout.trim();
    assert.equal(decoded, "SHA256=" + expected.rgbaSha256, "All independently decoded image pixels must match");
    return { ...result, independentImageDecode: true, decodedRgbaSha256: expected.rgbaSha256 };
  }
  await native(["-nostdin", "-v", "error", "-xerror", "-i", file, "-map", "0:v:0", "-frames:v", "1", "-f", "null", "-"]);
  return { ...result, independentImageDecode: true };
};
const sourceFiles = ["scripts/test-audio-metadata-production-runtime.mjs", "scripts/lib/audio-metadata-artifact.mjs", "scripts/lib/audio-metadata-fidelity-fixture.mjs",
  "scripts/lib/audio-comment-validation.mjs", "scripts/lib/streaming-audio-fidelity.mjs", "scripts/lib/scoped-audio-tag-validation.mjs",
  "scripts/lib/audio-repeated-comment-fixture.mjs", "scripts/lib/audio-artwork-validation.mjs",
  "scripts/lib/audio-artwork-budget-fixture.mjs", "scripts/lib/ogg-picture-comment-inspection.mjs",
  "scripts/lib/audio-artwork-rejection-fixture.mjs", "scripts/lib/audio-artwork-rejection-validation.mjs",
  "scripts/lib/audio-io-recovery-validation.mjs",
  "scripts/lib/audio-metadata-field-budget-fixture.mjs", "scripts/lib/audio-metadata-field-budget-validation.mjs",
  "scripts/lib/audio-metadata-byte-budget-fixture.mjs", "scripts/lib/audio-metadata-byte-budget-validation.mjs",
  "scripts/lib/bounded-network-observer.mjs", "scripts/lib/opfs-disk-backing-proof.mjs", "scripts/lib/bounded-validation-chunk.mjs",
  "scripts/lib/lossless-native-memory-journal.mjs", "scripts/lib/native-memory-peaks.mjs", "scripts/lib/persistent-chromium-memory.mjs", "scripts/lib/chromium-private-memory.mjs",
  "scripts/lib/birth-aware-chromium-memory.mjs", "scripts/lib/birth-aware-memory-observer-source.mjs", "scripts/lib/windows-tree-monitor.cs",
  "scripts/lib/windows-process-birth-proof.cs", "scripts/lib/windows-tree-monitor-birth-aware.ps1",
  "scripts/lib/opfs-output-validation-backing.mjs",
  "scripts/lib/vorbis-large-fixture.mjs", "scripts/lib/long-audio-fidelity.mjs",
  "scripts/lib/vorbis-io-fixture.mjs",
  "scripts/lib/audio-standard-repeated-fixture.mjs",
  "scripts/lib/id3-metadata-validation.mjs",
  "scripts/lib/audio-float-peak-validation.mjs", "scripts/lib/mp3-clipping-fixture.mjs",
  "workers/conversion.worker.ts", "workers/media-remux.ts", "workers/random-access-destination.ts", "lib/browser-capabilities.ts", "lib/capability-registry.ts",
  "lib/native-input-memory-observation.ts",
  "lib/conversion-protocol.ts", "lib/media-native-arguments.ts",
  "lib/audio-metadata-budget-error.ts",
  "lib/audio-input-policy.ts",
  "lib/media-conversion-options.ts", "app/converter/ConverterApp.tsx", "app/globals.css"];
const pins = async () => Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, sha(await readFile(path.join(root, file)))])));
let browser, context, activePage, server, serverIdentity, monitor, journal, observer, monitorTimer, benchmarkSession, fieldFixtures, byteFixtures, clippingFixtures, largeFixture, largeBudgetFailure, largeBudgetCancellationAttempted = false, pending = Promise.resolve(), snapshotPending, monitorFailure, busy = false, serverLog = "", originalHash;
const identities = [], staged = [], tail = [], phases = [{ phase: "blank", at: Date.now() }];
const phase = name => phases.push({ phase: name, at: Date.now() });
const snapshot = async () => {
  if (snapshotPending) return snapshotPending;
  snapshotPending = (async () => { const batch = await monitor.drain();
    const samples = batch.samples.map(s => ({ ...s, phase: phases.findLast(p => p.at <= Date.parse(s.timestamp))?.phase ?? "unavailable" }));
    await journal.appendBatch({ ...batch, samples }); tail.push(...samples); if (tail.length > 128) tail.splice(0, tail.length - 128);
    if (largeVorbisRepeat && report.blankBaseline && !largeBudgetFailure) {
      const peak = journal.peaksExcept(["blank"]).peak;
      if (peak && (peak.privateBytes - report.blankBaseline.privateBytes) / 1048576 > 250) {
        largeBudgetFailure = "Full normal Chrome tree exceeded250MiB; keep every process and fail without rerunning unchanged";
        if (activePage && !largeBudgetCancellationAttempted) {
          largeBudgetCancellationAttempted = true;
          try { if (await activePage.evaluate(() => window.__WITHIN_TEST__?.getState().jobState === "running"))
            await activePage.getByRole("button", { name: "Cancel safely", exact: true }).click({ timeout: 5000 }); }
          catch (error) { report.budgetCancellationDiagnostic = String(error).slice(0, 512); }
        }
      }
    }
  })().finally(() => { snapshotPending = null; }); return snapshotPending;
};
const recordMemory = () => {
  if (!journal || !report.blankBaseline) return;
  const all = journal.peaksExcept([]), active = journal.peaksExcept(["blank"]);
  if (active.peak) report.memory = { scope: largeVorbisRepeat ? "full-size private automatic-q7 repeats including validation and cleanup; not public qualification" : "selected-small-case lifecycle only, not stress acceptance", limitMiB: 250, intervalMs: 100,
    peak: active.peak, incrementalPrivateMiB: (active.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576,
    validSamples: all.validSamples, unavailableSamples: all.unavailableSamples, fullHistoryInLosslessJournal: true };
};
try {
  report.executedHead = (await execute("git", ["rev-parse", "HEAD"], { cwd: root, env, windowsHide: true, maxBuffer: 1024 })).stdout.trim();
  report.sources = await pins(); const disk = await statfs(root); assert.ok(disk.bavail * disk.bsize >= 2 * 1024 ** 3);
  report.hostMemory = await inspectStressHostMemory(); assert.equal(report.hostMemory.safeToStart, true);
  assert.equal((await lstat(path.join(root, "test.mkv"))).size, 2958573265); originalHash = await hashFile(path.join(root, "test.mkv"));
  assert.equal(originalHash, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  report.browser = await inspectInstalledChromePin(); report.artifact = await auditAudioMetadataArtifact(process.argv[2]);
  if (mp3GainRepair) {
    assert.equal(report.artifact.core.upstreamLameGainPatch?.sourceEdits, 1); assert.equal(report.artifact.core.codecSettingsChanged, true);
    assert.equal(report.artifact.core.upstreamLameGainPatch.bitRateAndQualityUnchanged, true);
  }
  report.fixtures = {};
  for (const source of ["flac", "ogg", "opus"]) {
    const file = path.join(runtime.directory, "source." + source); await native(audioMetadataFixtureArguments(source, file));
    const bytes = (await lstat(file)).size; assert.ok(bytes < 1048576);
    const hash = await hashFile(file); assert.equal(hash, report.artifact.fixtures[source].sha256); assert.equal(bytes, report.artifact.fixtures[source].bytes);
    report.fixtures[source] = { bytes, sha256: hash };
  }
  report.repeatedFixtures = {};
  for (const source of remainingRepeated || flacOrderRepair || automaticVorbisRepair ? ["flac", "ogg", "opus"] : ["flac"]) {
    const original = path.join(runtime.directory, "source." + source), repeatedFile = path.join(runtime.directory, "source-repeated." + source);
    const bytes = await readFile(original), generated = source === "flac" ? appendFlacFixtureComments(bytes, AUDIO_REPEATED_COMMENTS)
      : appendOggFixtureComments(bytes, source, AUDIO_REPEATED_COMMENTS);
    await writeFile(repeatedFile, generated, { flag: "wx" });
    report.repeatedFixtures[source] = { bytes: (await lstat(repeatedFile)).size, sha256: await hashFile(repeatedFile),
      sourcePcmUnchanged: await compareNativeAudioPcm(original, repeatedFile, { cwd: root, env, lossless: true }) };
    const repeatedSource = await readAudioCommentEntries(repeatedFile, source);
    assert.deepEqual(repeatedSource.entries.filter(s => s.split("=", 1)[0].toLowerCase() === "custom_repeat"), AUDIO_REPEATED_COMMENTS);
  }
  report.repeatedFixture = report.repeatedFixtures.flac;
  if (standardRepeatedAudio) {
    report.standardRepeatedFixtures = {};
    for (const source of ["flac", "ogg", "opus"]) {
      const original = path.join(runtime.directory, "source." + source), file = path.join(runtime.directory, "source-standard-repeated." + source);
      const generated = makeStandardRepeatedAudioFixture(await readFile(original), source);
      await writeFile(file, generated, { flag: "wx" });
      const rawComments = await readAudioCommentEntries(file, source), repeated = validateStandardRepeatedAudioComments(rawComments);
      assert.equal(repeated.status, "passed", "New INPUT must contain both independent values in all four standard alias families");
      report.standardRepeatedFixtures[source] = { bytes: generated.length, sha256: sha(generated), repeated,
        sourcePcmUnchanged: await compareNativeAudioPcm(original, file, { cwd: root, env, lossless: true }) };
    }
  }
  if (largeVorbisRepeat) {
    console.log(JSON.stringify({ stage: "generate-exact-full-size-input", bytes: VORBIS_LARGE_FIXTURE.bytes }));
    largeFixture = await createVorbisLargeFixture(runtime.directory, env);
    const probe = await probeAudio(largeFixture.file), audio = probe.streams.find(value => value.codec_type === "audio");
    assert.equal(probe.streams.length, 1); assert.equal(audio.codec_name, "opus"); assert.equal(Number(audio.sample_rate), 48000); assert.equal(audio.channels, 2);
    assert.ok(Math.abs(Number(probe.format.duration) - 2300.0065) < 0.00001);
    assert.equal(validateScopedAudioTags(probe, largeFixture.expectedTags, { scope: "audio-stream" }).status, "passed");
    const { file: ignoredFile, ...facts } = largeFixture; assert.ok(ignoredFile);
    report.largeAudioFixture = { ...facts, probe };
    report.longDecoderProbe = await compareNativeLongAudioPcm(path.join(runtime.directory, "source.opus"), path.join(runtime.directory, "source.opus"), { cwd: root, env, channels: 1, expectedFrames: 96000 });
    assert.equal(report.longDecoderProbe.exact, true);
    assert.equal(report.longDecoderProbe.sourceSha256, "5a677ce930d335071a0617437cfe1997afbad3b98a00c823f2bc558ecc73dfb5");
  }
  if (audioIoRecovery || mp3IoRecovery) {
    const args = audioMetadataFixtureArguments("flac", path.join(runtime.directory, "source-cancel.flac"));
    const signal = args.indexOf("sine=frequency=997:sample_rate=48000:duration=2"); assert.ok(signal > 0);
    args[signal] = "sine=frequency=997:sample_rate=48000:duration=180"; await native(args);
    const file = path.join(runtime.directory, "source-cancel.flac"), probe = await probeAudio(file);
    assert.equal(probe.streams.length, 1); assert.equal(probe.streams[0].codec_name, "flac"); assert.equal(Number(probe.format.duration), 180);
    assert.equal(validateScopedAudioTags(probe, AUDIO_METADATA_TAGS, { scope: "format" }).status, "passed");
    await native(["-nostdin", "-v", "error", "-xerror", "-i", file, "-map", "0:a:0", "-f", "null", "-"]);
    const bytes = (await lstat(file)).size; assert.ok(bytes < 8 * 1048576);
    report.cancellationFixture = { bytes, sha256: await hashFile(file), durationSeconds: 180, probe, independentlyDecodedInput: true, successfulOutputFidelityAcceptance: false };
  }
  if (vorbisIoRecovery) {
    const fixture = await createVorbisIoFixture(runtime.directory, env), probe = await probeAudio(fixture.file);
    assert.equal(probe.streams.length, 1); assert.equal(probe.streams[0].codec_name, "opus"); assert.equal(Number(probe.streams[0].sample_rate), 48000);
    assert.equal(probe.streams[0].channels, 2); assert.ok(Math.abs(Number(probe.format.duration) - 180.0065) < 0.00001);
    assert.equal(validateScopedAudioTags(probe, AUDIO_METADATA_TAGS, { scope: "audio-stream" }).status, "passed");
    const sourceDecode = await compareNativeLongAudioPcm(fixture.file, fixture.file, { cwd: root, env, channels: 2, expectedFrames: 8640000 });
    assert.equal(sourceDecode.exact, true); assert.equal(sourceDecode.samples, 17280000);
    const { file: ignoredFile, ...facts } = fixture; assert.ok(ignoredFile);
    report.cancellationFixture = { ...facts, probe, sourceDecode, independentlyDecodedInput: true, successfulOutputFidelityAcceptance: false };
  }
  if (artworkBudget || audioIoRecovery) {
    const fixture = await createAudioArtworkBudgetFixture(runtime.directory); report.artworkImages = { "png-budget": fixture.expected };
    report.artworkBudgetRecipe = fixture.recipe;
    report.artworkFixtures = { "flac-png-budget": { bytes: fixture.bytes, sha256: fixture.sha256,
      sourcePcmUnchanged: await compareNativeAudioPcm(path.join(runtime.directory, "source.flac"), fixture.file, { cwd: root, env, lossless: true }),
      artwork: await inspectArtwork(fixture.file, await probeAudio(fixture.file), fixture.expected) } };
  }
  if (metadataFieldBudget) {
    fieldFixtures = await createAudioMetadataFieldBudgetFixtures(runtime.directory); report.metadataFieldFixtures = {};
    for (const [key, fixture] of Object.entries(fieldFixtures)) {
      const probe = await probeAudio(fixture.file); assert.equal(validateScopedAudioTags(probe, AUDIO_METADATA_TAGS, { scope: "format" }).status, "passed");
      report.metadataFieldFixtures[key] = { bytes: fixture.bytes, sha256: fixture.sha256, summary: fixture.summary,
        sourcePcmUnchanged: await compareNativeAudioPcm(path.join(runtime.directory, "source.flac"), fixture.file, { cwd: root, env, lossless: true }) };
    }
    report.metadataFieldProbeProjection = { scope: "native FFprobe canonical25 tags only; all added fields checked separately from binary comments", maximumNativeBufferBytes: 131072 };
  }
  if (metadataByteBudget) {
    byteFixtures = await createAudioMetadataByteBudgetFixtures(runtime.directory); report.metadataByteFixtures = {};
    for (const [key, fixture] of Object.entries(byteFixtures)) {
      assert.equal(validateScopedAudioTags(await probeAudio(fixture.file), AUDIO_METADATA_TAGS, { scope: "format" }).status, "passed");
      report.metadataByteFixtures[key] = { bytes: fixture.bytes, sha256: fixture.sha256, summary: fixture.summary,
        sourcePcmUnchanged: await compareNativeAudioPcm(path.join(runtime.directory, "source.flac"), fixture.file, { cwd: root, env, lossless: true }) };
    }
    report.metadataByteProbeProjection = { scope: "native canonical25 tags only; all1024 boundary fields independently checked from raw output", maximumNativeBufferBytes: 131072 };
  }
  if (artworkRejection) {
    const fixtures = await createAudioArtworkRejectionFixtures(runtime.directory);
    report.artworkImages = {}; report.artworkFixtures = {}; report.artworkBudgetRecipe = fixtures.accepted.recipe;
    for (const [key, fixture, rejected] of [["png-over-bytes", fixtures.overBytes, true], ["png-over-dimension", fixtures.overDimension, true], ["png-budget", fixtures.accepted, false]]) {
      report.artworkImages[key] = fixture.expected;
      report.artworkFixtures["flac-" + key] = { bytes: fixture.bytes, sha256: fixture.sha256,
        sourcePcmUnchanged: await compareNativeAudioPcm(path.join(runtime.directory, "source.flac"), fixture.file, { cwd: root, env, lossless: true }),
        artwork: await inspectArtwork(fixture.file, await probeAudio(fixture.file), fixture.expected, rejected) };
    }
  }
  if (withArtwork) {
    report.artworkImages = {}; report.artworkFixtures = {};
    for (const codec of mp3SingleCanary ? ["png"] : ["png", "mjpeg"]) {
      const image = path.join(runtime.directory, "cover." + (codec === "png" ? "png" : "jpg"));
      await native(["-v", "error", "-f", "lavfi", "-i", "color=c=0x2457d6:s=64x64:d=0.04", "-frames:v", "1", "-c:v", codec,
        "-threads", "1", "-fflags", "+bitexact", "-flags:v", "+bitexact", "-f", "image2", image]);
      const imageSize = (await lstat(image)).size; assert.ok(imageSize > 8 && imageSize <= 65536);
      const pictureOptions = oggArtwork || mp3ArtworkMetadata ? { pictureType: codec === "png" ? 3 : 4, description: codec === "png" ? "表紙 — Front cover" : "Pochette arrière café — 音楽" } : undefined;
      const bytes = await readFile(image), expected = { codec, width: 64, height: 64, bytes: bytes.length, sha256: sha(bytes),
        ...(pictureOptions ? { pictureRole: pictureOptions.pictureType === 3 ? "Cover (front)" : "Cover (back)", description: pictureOptions.description } : {}) };
      report.artworkImages[codec] = expected;
      for (const source of mp3SingleCanary ? ["flac"] : oggArtwork || mp3ArtworkMetadata ? ["flac", "ogg", "opus"] : ["ogg", "opus"]) {
        if (mp3Clipping) continue; // Only the new full-scale inputs, not a replayed canonical carrier.
        if (mp3GainMatrix && !selectedCases.some(row => row.source === source && row.artwork === codec)) continue;
        const original = path.join(runtime.directory, "source." + source), file = path.join(runtime.directory, `source-artwork-${codec}.${source}`);
        const sourceBytes = await readFile(original);
        const addedText = mp3ArtworkMetadata ? [] : AUDIO_REPEATED_COMMENTS;
        const generated = source === "flac"
          ? appendFlacArtworkFixture(appendFlacFixtureComments(sourceBytes, addedText), audioArtworkFixturePicture(bytes, codec, pictureOptions))
          : appendOggFixtureComments(sourceBytes, source, [...addedText, audioArtworkFixtureComment(bytes, codec, pictureOptions)]);
        await writeFile(file, generated, { flag: "wx" });
        const comments = await readAudioCommentEntries(file, source);
        assert.deepEqual(comments.entries.filter(s => s.split("=", 1)[0].toLowerCase() === "custom_repeat"), addedText);
        report.artworkFixtures[source + "-" + codec] = { bytes: generated.length, sha256: sha(generated),
          sourcePcmUnchanged: await compareNativeAudioPcm(original, file, { cwd: root, env, lossless: true }),
          artwork: await inspectArtwork(file, await probeAudio(file), expected) };
      }
    }
  }
  if (mp3Clipping) {
    clippingFixtures = await createMp3ClippingFixtures(runtime.directory, env, await readFile(path.join(runtime.directory, "cover.png")));
    report.clippingFixtures = {};
    for (const [key, fixture] of Object.entries(clippingFixtures)) {
      const probe = await probeAudio(fixture.file), audio = probe.streams.filter(value => value.codec_type === "audio");
      assert.equal(audio.length, 1); assert.equal(audio[0].codec_name, "flac"); assert.equal(audio[0].channels, fixture.channels);
      assert.equal(Number(audio[0].sample_rate), 48000); assert.equal(Number(probe.format.duration), 2);
      assert.equal(validateScopedAudioTags(probe, AUDIO_METADATA_TAGS, { scope: "format" }).status, "passed");
      const sourcePcmUnchanged = await compareNativeAudioPcm(fixture.baseFile, fixture.file, { cwd: root, env, lossless: true });
      assert.equal(sourcePcmUnchanged.samples, 96000 * fixture.channels); assert.equal(sourcePcmUnchanged.exact, true);
      const floatPeaks = await decodeNativeFloatPeaks(fixture.file, { cwd: root, env, channels: fixture.channels, expectedFrames: 96000 });
      assert.equal(validateNearFullScalePeaks(floatPeaks, floatPeaks).status, "passed", "Fixture must really be near full scale and not preclipped");
      const { file: ignoredFile, baseFile: ignoredBase, ...facts } = fixture; assert.ok(ignoredFile && ignoredBase);
      report.clippingFixtures[key] = { ...facts, probe, sourcePcmUnchanged, floatPeaks,
        artwork: await inspectArtwork(fixture.file, probe, report.artworkImages.png) };
    }
  }
  await execute(process.execPath, ["node_modules/vinext/dist/cli.js", "build"], { cwd: root, env, windowsHide: true, timeout: 180000, maxBuffer: 4 * 1024 ** 2 });
  for (const file of ["within-remux.mjs", "within-remux.wasm"]) {
    const target = path.join(root, "dist/client/engines/remux", file), backup = path.join(runtime.directory, "original-" + file), original = sha(await readFile(target));
    assert.equal(original, sha(await readFile(path.join(root, "public/engines/remux", file)))); await copyFile(target, backup);
    const row = { target, backup, original, candidate: report.artifact.deliveredArtifacts[file], staged: false }; staged.push(row);
    await copyFile(path.join(report.artifact.directory, file), target); row.staged = true; row.identity = await lstat(target, { bigint: true });
    assert.equal(sha(await readFile(target)), row.candidate);
  }
  const port = 3219, base = `http://127.0.0.1:${port}`, { createServer } = await import("node:net"), portProbe = createServer();
  await new Promise((resolve, reject) => { portProbe.once("error", reject); portProbe.listen(port, "127.0.0.1", resolve); }); await new Promise(r => portProbe.close(r));
  server = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--config", "dist/server/wrangler.json", "--port", String(port), "--persist-to", path.join(runtime.directory, "wrangler")],
    { cwd: root, env, windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
  serverIdentity = await queryProcessIdentity(server.pid); assert.ok(serverIdentity); identities.push(serverIdentity);
  for (const pipe of [server.stdout, server.stderr]) pipe.on("data", b => { serverLog = (serverLog + b.toString()).slice(-16384); });
  let ready = false;
  for (let i = 0; i < 60; i++) { assert.equal(server.exitCode, null, serverLog); try { if ((await fetch(base)).ok) { ready = true; break; } } catch {} await pause(500); }
  assert.ok(ready, serverLog);
  const internal = createRequire(import.meta.url)(path.join(root, "node_modules/playwright-core/lib/coreBundle.js")); assert.equal(internal.getPlaywrightVersion(), "1.62.1");
  observer = installBoundedNetworkObserver(Object.getPrototypeOf(internal.server.createPlaywright({ sdkLanguage: "javascript", isServer: true }).chromium), "_innerLaunchWithRetries");
  report.protocolObserverBinding = { version: internal.getPlaywrightVersion(), sha256: sha(await readFile(path.join(root, "node_modules/playwright-core/lib/coreBundle.js"))) };
  const profile = path.join(runtime.directory, "chrome-profile"); await mkdir(profile);
  context = await chromium.launchPersistentContext(profile, { executablePath: report.browser.launcher.path, headless: true, env, serviceWorkers: "block" }); browser = context.browser(); assert.ok(browser);
  const identitySession = await browser.newBrowserCDPSession();
  try { const roots = (await identitySession.send("SystemInfo.getProcessInfo")).processInfo.filter(p => p.type === "browser"); assert.equal(roots.length, 1);
    const identity = await queryProcessIdentity(Number(roots[0].id)); assert.ok(identity); identities.push(identity); report.browserBirth = identity;
  } finally { await identitySession.detach(); }
  assert.ok(context.pages().length <= 1); const page = context.pages()[0] ?? await context.newPage();
  activePage = page;
  if (artworkBenchmark) benchmarkSession = await context.newCDPSession(page);
  await context.addInitScript({ content: "Object.defineProperty(globalThis, '__WITHIN_AUDIO_VALIDATION_CHUNK__', { value: (" + encodeBoundedValidationChunk.toString() + ") });" });
  context.on("request", request => { report.network.observedRequests++;
    if (request.url() === base + "/engines/remux/within-remux.mjs") report.network.nativeGlueRequests++;
    if (request.url() === base + "/engines/remux/within-remux.wasm") report.network.nativeWasmRequests++;
    if (!request.url().startsWith(base + "/") || request.method() !== "GET" || request.postData() !== null) {
      assert.ok(report.network.forbidden.length < 16); report.network.forbidden.push({ method: request.method(), url: request.url().slice(0, 256) });
    }
  });
  journal = await createLosslessNativeMemoryJournal(report.browserBirth.pid, path.join(root, "output/playwright", stamp + "-audio-fidelity-memory.ndjson"));
  monitor = await startChromiumMemoryMonitor(report.browserBirth.pid, runtime.directory, 100); const monitorIdentity = await queryProcessIdentity(monitor.pid); assert.ok(monitorIdentity); identities.push(monitorIdentity);
  monitorTimer = setInterval(() => { if (busy) return; busy = true; pending = snapshot().catch(e => { monitorFailure ??= e; }).finally(() => { busy = false; }); }, 500);
  const observations = [], windows = [];
  for (let i = 0; i < 20; i++) { await pause(2100); await snapshot(); observations.push({ ...tail.at(-1), elapsedMs: Date.parse(tail.at(-1).timestamp) - Date.parse(report.browserBirth.createdAt) });
    const stable = stableWindow(observations, 8000); if (stable) windows.push(stable); if (windows.length >= 2) break; }
  assert.ok(windows.length >= 2); report.blankBaseline = windows.reduce((a, b) => a.privateBytes < b.privateBytes ? a : b);
  phase("loaded"); const response = await page.goto(base + "/?test=1"); assert.equal(response.status(), 200);
  const headers = response.headers(); assert.equal(headers["cross-origin-opener-policy"], "same-origin"); assert.equal(headers["cross-origin-embedder-policy"], "require-corp");
  await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready"); report.diskProof = await verifyOpfsDiskBacking(page, profile);
  const loaded = [];
  for (let i = 0; i < 30; i++) { await pause(2100); await snapshot(); loaded.push({ ...tail.at(-1), elapsedMs: Date.parse(tail.at(-1).timestamp) - Date.parse(report.browserBirth.createdAt) });
    const stable = stableWindow(loaded, 8000); if (stable) { report.loadedIdle = stable; break; } }
  assert.ok(report.loadedIdle);
  report.screenshots = [];
  const storageSnapshot = () => page.evaluate(async () => {
    const directory = await navigator.storage.getDirectory(), entries = [];
    for await (const [name, handle] of directory.entries()) {
      if (entries.length >= 16) throw new Error("Unexpected OPFS inventory growth");
      entries.push({ name, kind: handle.kind, bytes: handle.kind === "file" ? (await handle.getFile()).size : null });
    }
    return entries.sort((a, b) => a.name.localeCompare(b.name));
  });
  const validationCheckpoint = async () => {
    await snapshot(); const sample = tail.findLast(value => value.privateBytes !== null);
    const heap = await benchmarkSession.send("Runtime.getHeapUsage");
    assert.ok(Number.isFinite(heap.usedSize) && Number.isFinite(heap.totalSize));
    return { at: new Date().toISOString(), pageRealmHeap: heap, pageRealmOnlyNotWorkerOrProcessMemory: true,
      nativeSample: sample ? { sequence: sample.sequence, timestamp: sample.timestamp, phase: sample.phase, privateBytes: sample.privateBytes } : null,
      primaryStillIncludesAllNonblankPhases: true, noForcedGcOrArtificialCooldown: true };
  };
  const screenshot = async (conversion, index, row) => {
    const directory = path.join(root, "output/playwright", stamp + "-audio-fidelity"); await mkdir(directory, { recursive: true });
    await page.locator(".progress-panel").scrollIntoViewIfNeeded(); const file = path.join(directory, `case-${index}-terminal.png`);
    if (conversion.expectedExclusion) await page.getByText(ARTWORK_BUDGET_EXCLUSION_WARNING, { exact: true }).first().scrollIntoViewIfNeeded();
    if (conversion.interruption === "write" || conversion.metadataFailure) await page.getByText(row.browserState.error, { exact: true }).first().scrollIntoViewIfNeeded();
    await page.screenshot({ path: file, fullPage: false }); const bytes = await readFile(file); assert.ok(bytes.length <= 4 * 1048576);
    report.screenshots.push({ path: path.relative(root, file).replaceAll(path.sep, "/"), bytes: bytes.length, sha256: sha(bytes), headedCoverage: false });
  };
  for (const [index, conversion] of selectedCases.entries()) {
    if (monitorFailure) throw monitorFailure;
    if (largeBudgetFailure) throw new Error(largeBudgetFailure);
    const profileId = `${conversion.source}-to-${conversion.destination}`, input = conversion.highAmplitude ? clippingFixtures[conversion.highAmplitude].file : conversion.standardRepeated ? path.join(runtime.directory, "source-standard-repeated." + conversion.source) : conversion.largeStereo ? largeFixture.file : conversion.byteBudget ? byteFixtures[conversion.byteBudget].file : conversion.fieldBudget ? fieldFixtures[conversion.fieldBudget].file : path.join(runtime.directory, conversion.interruption === "cancel" ? (vorbisIoRecovery ? "source-cancel.opus" : "source-cancel.flac") : conversion.artwork
      ? `source-artwork-${conversion.artwork}.${conversion.source}` : (conversion.repeated ? "source-repeated." : "source.") + conversion.source),
      outputCopy = path.join(runtime.directory, `output-${index}.${conversion.destination}`);
    let output = outputCopy, physicalBinding;
    const row = { name: profileId + (conversion.repeated ? "-repeated-values" : "") + (conversion.artwork ? "-" + conversion.artwork + "-cover" : "") + (conversion.quality ? "-" + conversion.quality : "")
      + (conversion.expectedExclusion ? "-expected-exclusion" : "") + (conversion.recoveryAfterExclusions ? "-same-page-recovery" : "")
      + (conversion.interruption ? "-" + conversion.interruption : "") + (conversion.recoveryAfterIo ? "-after-io-interruptions" : "")
      + (artworkBenchmark ? "-benchmark-" + conversion.benchmarkIteration : ""),
      profileId, requestedQuality: conversion.quality ?? "automatic", repeated: Boolean(conversion.repeated), interruption: conversion.interruption ?? null,
      ...(artworkBenchmark ? { benchmarkIteration: conversion.benchmarkIteration, benchmarkWarmup: conversion.benchmarkWarmup } : {}), status: "failed", failures: [] }; report.cases.push(row);
    if (metadataFieldBudget) { row.name += "-" + (conversion.fieldBudget ?? "metadata-recovery"); row.metadataFailure = conversion.metadataFailure ?? null; }
    if (metadataByteBudget) { row.name += "-text-bytes-" + (conversion.byteBudget ?? "recovery"); row.metadataFailure = conversion.metadataFailure ?? null; }
    if (conversion.largeStereo) { row.name += "-large-stereo-repeat-" + conversion.repeat; row.largeStereo = true; }
    if (conversion.standardRepeated) { row.name += "-standard-repeated-aliases"; row.standardRepeated = true; }
    if (conversion.highAmplitude) { row.name += "-fullscale-" + conversion.highAmplitude; row.highAmplitude = conversion.highAmplitude; }
    let outputIdentity, entryName;
    try {
      const expectedTags = conversion.standardRepeated ? STANDARD_AUDIO_SCALAR_TAGS : conversion.largeStereo ? largeFixture.expectedTags : AUDIO_METADATA_TAGS;
      const sourceProbe = await probeAudio(input); const tags = validateScopedAudioTags(sourceProbe, expectedTags, { scope: conversion.source === "flac" ? "format" : "audio-stream" }); assert.equal(tags.status, "passed");
      row.source = { ...report.fixtures[conversion.source], ...(conversion.repeated ? report.repeatedFixtures[conversion.source] : {}), tags };
      if (conversion.artwork) row.source = { ...report.artworkFixtures[conversion.source + "-" + conversion.artwork], tags };
      if (conversion.fieldBudget) row.source = { ...report.metadataFieldFixtures[conversion.fieldBudget], tags };
      if (conversion.byteBudget) row.source = { ...report.metadataByteFixtures[conversion.byteBudget], tags };
      if (conversion.largeStereo) row.source = { ...report.largeAudioFixture, tags };
      if (conversion.interruption === "cancel") row.source = { ...report.cancellationFixture, tags };
      if (conversion.standardRepeated) row.source = { ...report.standardRepeatedFixtures[conversion.source], tags };
      if (conversion.highAmplitude) row.source = { ...report.clippingFixtures[conversion.highAmplitude], tags };
      if (audioIoRecovery || vorbisIoRecovery || mp3IoRecovery) await page.evaluate(fault => { history.replaceState(null, "", "/?test=1" + (fault ? "&fault=write" : "")); }, conversion.interruption === "write");
      phase("case-" + index); await page.locator('[data-testid="file-input"]').setInputFiles(input); await page.locator('[data-testid="format-select"]').selectOption(profileId);
      await page.waitForFunction(() => !document.querySelector('[data-testid="convert-button"]')?.disabled && window.__WITHIN_TEST__?.getState().workerStatus === "ready");
      if (conversion.quality) {
        await page.locator('[data-testid="audio-quality-select"]').selectOption(conversion.quality);
        assert.equal(await page.locator('[data-testid="audio-quality-select"]').inputValue(), conversion.quality);
      }
      if (automaticVorbisRepair || vorbisIoRecovery || (standardRepeatedAudio && profileId === "opus-to-ogg")) {
        assert.equal(await page.locator('[data-testid="audio-quality-select"]').inputValue(), "automatic");
        await page.getByTestId("audio-automatic-quality-notice").waitFor({ state: "visible" });
        assert.equal(await page.getByTestId("audio-automatic-quality-notice").textContent(), OPUS_VORBIS_AUTOMATIC_QUALITY_NOTICE);
        row.automaticQualityNoticeVisible = true;
      }
      if (conversion.interruption || conversion.metadataFailure) { row.storageBefore = await storageSnapshot(); assert.deepEqual(row.storageBefore, []); }
      const startedAt = Date.now(); await page.locator('[data-testid="convert-button"]').click();
      if (conversion.largeStereo) console.log(JSON.stringify({ stage: "real-browser-large-conversion", repeat: index + 1, inputBytes: largeFixture.bytes, estimatedConversionSeconds: 70 }));
      if (conversion.interruption === "cancel") {
        await page.waitForFunction(() => { const state = window.__WITHIN_TEST__?.getState();
          return state?.jobState === "running" && state.metrics?.inputBytes > 0 && state.metrics?.outputBytes > 0;
        }, null, { timeout: 30000 });
        if (conversion.byobCancellation) await page.waitForFunction(() => {
          const state = window.__WITHIN_TEST__?.getState();
          return state?.jobState === "running" && state.metrics?.inputBytes > 262144 && state.metrics?.outputBytes > 65536;
        }, null, { timeout: 30000 });
        if (conversion.payloadCancellation) await page.waitForFunction(() => {
          const state = window.__WITHIN_TEST__?.getState();
          return state?.jobState === "running" && state.metrics?.inputBytes > 262144 && state.metrics?.outputBytes > 65536;
        }, null, { timeout: 30000 });
        row.beforeCancel = await page.evaluate(() => window.__WITHIN_TEST__.getState());
        await page.getByRole("button", { name: "Cancel safely", exact: true }).click();
      }
      await page.waitForFunction(() => ["complete", "error", "cancelled"].includes(window.__WITHIN_TEST__?.getState().jobState ?? ""), null, { timeout: conversion.largeStereo ? 240000 : 60000 });
      if (conversion.interruption || conversion.metadataFailure) await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready");
      const state = await page.evaluate(() => window.__WITHIN_TEST__.getState()); row.browserElapsedMs = Date.now() - startedAt; row.browserState = state; entryName = state.opfsName;
      if (artworkBenchmark || conversion.largeStereo) { assert.ok(Number.isFinite(state.metrics.elapsedMs) && state.metrics.elapsedMs > 0); row.engineElapsedMs = state.metrics.elapsedMs; }
      assert.equal(state.audioOptions.quality, row.requestedQuality, "Actual production job must retain the requested quality selection");
      if (automaticVorbisRepair || vorbisIoRecovery || (standardRepeatedAudio && profileId === "opus-to-ogg")) {
        assert.equal(state.audioOptions.quality, "automatic");
        assert.deepEqual(state.metrics.audioQualityArgument, { requested: "automatic", nativeCode: 3, automaticPolicy: "opus-to-vorbis-q7" });
        row.actualAutomaticQualityArgument = state.metrics.audioQualityArgument;
      }
      if (largeBudgetFailure) throw new Error(largeBudgetFailure);
      if (conversion.largeStereo && state.jobState === "complete") {
        const transport = state.metrics.audioInputTransport; assert.equal(transport?.strategy, "persistent-byob");
        assert.equal(transport.maximumBufferBytes, 262144); assert.ok(transport.readCalls > 0 && transport.streamOpens > 0);
        assert.equal(transport.inFlight, 0); assert.equal(transport.peakInFlight, 1); assert.ok(transport.maximumReadBytes <= 262144);
        assert.ok(transport.explicitBufferAllocations <= 4 && transport.explicitAllocatedBufferBytes <= 4 * 262144,
          "Explicit input backing allocations must remain fixed for the entire147.96MB input");
        row.actualInputTransport = transport;
      }
      if (conversion.metadataFailure) {
        row.storageAfter = await storageSnapshot();
        row.metadataFailureProof = conversion.metadataFailure === "text-bytes"
          ? validateMetadataTextByteBudgetFailure(state, { storageBefore: row.storageBefore, storageAfter: row.storageAfter })
          : validateMetadataFieldBudgetFailure(conversion.metadataFailure, state, { storageBefore: row.storageBefore, storageAfter: row.storageAfter });
        if (metadataFieldRejectOnly) assert.match(state.error, /^The tags and cover exceed a bounded metadata limit/);
        await page.getByText(state.error, { exact: true }).first().waitFor({ state: "visible", timeout: 5000 }); row.metadataErrorVisible = true;
        row.status = conversion.metadataFailure === "text-bytes" ? "passed-private-metadata-byte-rejection-case" : "passed-private-metadata-field-rejection-case";
      } else if (conversion.interruption) {
        row.storageAfter = await storageSnapshot(); row.interruptionProof = validateAudioInterruption(conversion.interruption, state,
          { beforeCancel: row.beforeCancel, storageBefore: row.storageBefore, storageAfter: row.storageAfter });
        if (conversion.payloadCancellation) {
          assert.ok(row.beforeCancel.metrics.inputBytes > 262144 && row.beforeCancel.metrics.outputBytes > 65536);
          row.payloadCancellationProof = { moreThanHeaderReadAndWritten: true, noRetainedPartialEntries: true,
            outputAcceptance: false, publicAcceptance: false };
        }
        if (conversion.byobCancellation) {
          const before = row.beforeCancel.metrics, transport = state.metrics.audioInputTransport;
          assert.ok(before.inputBytes > 262144 && before.outputBytes > 65536);
          assert.equal(before.audioInputTransport?.strategy, "persistent-byob"); assert.equal(transport.strategy, "persistent-byob");
          assert.equal(transport.inFlight, 0); assert.equal(transport.peakInFlight, 1); assert.ok(transport.readCalls > 0);
          assert.ok(transport.explicitBufferAllocations <= 4 && transport.maximumReadBytes <= 262144);
          row.actualInputTransport = transport;
          row.byobCancellationProof = { actualPersistentReadPath: true, moreThanHeaderWritten: true, noOutstandingInputRead: true,
            workerRecovered: true, outputAcceptance: false, publicAcceptance: false };
        }
        if (conversion.interruption === "write") {
          await page.getByText(state.error, { exact: true }).first().waitFor({ state: "visible", timeout: 5000 }); row.interruptionErrorVisible = true;
        }
        row.status = "passed-private-audio-interruption-case";
      } else {
      assert.equal(state.jobState, "complete", state.error ?? state.phase); assert.ok(entryName);
      if (conversion.expectedExclusion) {
        assert.ok(state.warnings.includes(ARTWORK_BUDGET_EXCLUSION_WARNING));
        await page.getByText(ARTWORK_BUDGET_EXCLUSION_WARNING, { exact: true }).first().waitFor({ state: "visible", timeout: 5000 });
        assert.equal(await page.getByText(ARTWORK_BUDGET_EXCLUSION_WARNING, { exact: true }).first().isVisible(), true);
        row.exclusionWarningVisible = true;
      }
      for (const count of [state.metrics.maxReadChunkBytes, state.metrics.maxWriteChunkBytes, state.metrics.peakQueuedBytes]) assert.ok(count <= 262144);
      assert.ok(state.metrics.peakPendingOperations <= 1); assert.equal(state.metrics.pendingOperations, 0);
      const size = await page.evaluate(async name => (await (await (await navigator.storage.getDirectory()).getFileHandle(name)).getFile()).size, entryName);
      assert.ok(size > 0 && size < (conversion.largeStereo ? 256 * 1048576 : extendedArtworkInspection ? 8 * 1048576 : 1048576), "Only explicit finite qualification scopes may inspect larger finished outputs");
      if (artworkBenchmark) {
        row.validationDiagnostics = { terminal: await validationCheckpoint() };
        phase("case-" + index + "-validation-export");
      }
      if (physicalValidation) {
        physicalBinding = conversion.largeStereo ? await bindLargeAudioOutputValidationBacking(page, profile, entryName, size)
          : await bindOpfsOutputValidationBacking(page, profile, entryName, size); output = physicalBinding.file;
        row.physicalValidation = physicalBinding.proof;
      } else {
      const writer = await open(output, "wx"); outputIdentity = await writer.stat({ bigint: true });
      try { for (let offset = 0; offset < size; offset += 65536) {
        const encoded = await page.evaluate(async ({ name, offset, count }) => {
          const file = await (await (await navigator.storage.getDirectory()).getFileHandle(name)).getFile();
          return window.__WITHIN_AUDIO_VALIDATION_CHUNK__(new Uint8Array(await file.slice(offset, offset + count).arrayBuffer()));
        }, { name: entryName, offset, count: Math.min(65536, size - offset) });
        const bytes = decodeBoundedValidationChunk(encoded); assert.equal(bytes.length, Math.min(65536, size - offset)); let at = 0;
        while (at < bytes.length) { const n = (await writer.write(bytes, at, bytes.length - at, offset + at)).bytesWritten; assert.ok(n > 0); at += n; }
      } } finally { await writer.close(); }
      }
      if (artworkBenchmark) { row.validationDiagnostics.afterExport = await validationCheckpoint(); phase("case-" + index + "-independent-validation"); }
      const outputProbe = await probeAudio(output);
      if (!conversion.artwork || conversion.expectedExclusion) assert.equal(outputProbe.streams.length, 1);
      const audio = outputProbe.streams.find(stream => stream.codec_type === "audio"); assert.ok(audio);
      assert.equal(audio.codec_name, conversion.destination === "ogg" ? "vorbis" : conversion.destination); assert.equal(Number(audio.sample_rate), 48000); assert.equal(audio.channels, conversion.channels ?? (conversion.largeStereo ? 2 : 1));
      row.output = { bytes: size, sha256: await hashFile(output), probe: outputProbe };
      if (conversion.gainDiagnostic) {
        assert.equal(row.output.bytes, 34048); assert.equal(row.output.sha256, "4710ff605bb185db713b003a3b985ced3094dde4ea0c4a01c81501f33571dcaf");
        assert.deepEqual(state.metrics.audioQualityArgument, { requested: "automatic", nativeCode: 0, automaticPolicy: null });
        row.actualAutomaticQualityArgument = state.metrics.audioQualityArgument;
      }
      if (conversion.gainRepair) {
        assert.deepEqual(state.metrics.audioQualityArgument, { requested: "automatic", nativeCode: 0, automaticPolicy: null });
        row.actualAutomaticQualityArgument = state.metrics.audioQualityArgument;
        const prior = { "flac-png": "4710ff605bb185db713b003a3b985ced3094dde4ea0c4a01c81501f33571dcaf",
          "flac-mjpeg": "3380881cd83a4b8bba8808963a66d8e6edb05c40a10e3a337681cf3a06e25324",
          "ogg-png": "cc67fdf33c7f73063a29cec98ffec0f0b7f8a8e9e3f874419cd1457cc00d2e3e",
          "ogg-mjpeg": "f323fe4db2441aa5cc76396aa9cb9bf2f93aa54d0724a052dac081d6c5bbd9eb",
          "opus-png": "68ac4c9f413f2bbeb683118ebc33c476fdea334fbf9aab66955e346d1616f6a5",
          "opus-mjpeg": "b1a0fb5d41106317ea885c8d31d55afa5590e3d73d37c652376ee4198eff81a7" };
        if (!conversion.highAmplitude) assert.notEqual(row.output.sha256, prior[conversion.source + "-" + conversion.artwork], "Changed encoder policy must not return the old attenuated output");
      }
      if (automaticVorbisRepair && !largeVorbisRepeat && index === 0) assert.equal(row.output.sha256, "4db863292dcd76fbcf364a4986120ac9bc39d155a774d730376128058565f4db", "New actual AUTOMATIC call must match the retained full higher/q7 output control");
      if (conversion.largeStereo && index > 0) assert.equal(row.output.sha256, report.cases[0].output.sha256, "Full-size repeated outputs must be byte-identical");
      if (artworkBenchmark) assert.equal(row.output.sha256, "e00860de6c495310697e32ad31a0fa859cd0c082e5b8921088e33c55f9db71f3", "Every benchmark job must match the complete accepted output control");
      if (conversion.artwork && !conversion.expectedExclusion) {
        try { row.artwork = await inspectArtwork(output, outputProbe, report.artworkImages[conversion.artwork]); }
        catch (error) { row.failures.push("Embedded cover validation: " + String(error)); }
      }
      row.output.tags = validateScopedAudioTags(outputProbe, expectedTags, { scope: ["flac", "mp3"].includes(conversion.destination) ? "format" : "audio-stream" });
      if (row.output.tags.status !== "passed") row.failures.push("One or more required metadata fields lost or changed");
      try {
        if (conversion.largeStereo) console.log(JSON.stringify({ stage: "full-independent-unaligned-PCM-and-legacy-SDR", repeat: index + 1, expectedSamples: 220800000, estimatedValidationSeconds: 30 }));
        row.fidelity = conversion.largeStereo ? await compareNativeLongAudioPcm(input, output, { cwd: root, env, channels: 2, expectedFrames: 110400000 })
          : await compareNativeAudioPcm(input, output, { cwd: root, env, lossless: conversion.destination === "flac", ...(conversion.gainDiagnostic || conversion.gainRepair ? { diagnoseGain: true } : {}) }); row.fullIndependentDecode = true;
      }
      catch (error) { row.fidelity = error.fidelity ?? null; row.fullIndependentDecode = error.fullIndependentDecodePassed ?? false; row.failures.push(String(error)); }
      if (conversion.gainDiagnostic) {
        assert.equal(row.fidelity.samples, 96000); assert.equal(row.fidelity.minimumPsnrDb, 60); assert.equal(row.fidelity.squaredError, 2016507993);
        assert.equal(row.fidelity.sourceSha256, "6a56521d7b4572fafeab898fa878678763e4e5228603089c61690f42fc2b8083");
        assert.equal(row.fidelity.outputSha256, "0c6fb0ac28455fb8c0031cb59a9e018de2813ee119bf2edaf87a5614c0b95f8b");
        assert.ok(row.fidelity.amplitudeDiagnostic?.acceptanceUsesUnmodifiedSamples); row.gainDiagnostic = row.fidelity.amplitudeDiagnostic;
        row.sameRetainedAutomaticBytesAndUnmodifiedPcm = true;
      }
      if (conversion.gainRepair) {
        assert.equal(row.fidelity.samples, 96000 * (conversion.channels ?? 1)); assert.equal(row.fidelity.minimumPsnrDb, 60);
        const sourcePcm = { flac: "6a56521d7b4572fafeab898fa878678763e4e5228603089c61690f42fc2b8083",
          ogg: "985ab9f65cdef3f8aa3926c37620520755170ed232cebb35631127fd37104185",
          opus: "5a677ce930d335071a0617437cfe1997afbad3b98a00c823f2bc558ecc73dfb5" };
        assert.equal(row.fidelity.sourceSha256, conversion.highAmplitude ? report.clippingFixtures[conversion.highAmplitude].sourcePcmUnchanged.sourceSha256 : sourcePcm[conversion.source]);
        const gain = row.fidelity.amplitudeDiagnostic; assert.ok(gain?.acceptanceUsesUnmodifiedSamples);
        row.gainDiagnostic = gain; row.repairedGainProof = { exactOneSourceEditAudited: true, actualAutomaticNativeArgument: 0,
          fullPcmQualityPassed: row.fidelity.psnrDb === "infinity" || row.fidelity.psnrDb >= 60,
          gainRestoredWithinOnePartPerThousand: Math.abs(gain.leastSquaresGain - 1) <= 0.001,
          audioNormalized: false, alignmentApplied: false, clippingAcceptance: false, publicAcceptance: false };
        if (!row.repairedGainProof.gainRestoredWithinOnePartPerThousand) row.failures.push("Private gain policy did not restore input amplitude");
      }
      if (conversion.highAmplitude) {
        row.decodedFloatPeaks = await decodeNativeFloatPeaks(output, { cwd: root, env, channels: conversion.channels, expectedFrames: 96000 });
        row.nearFullScalePeakProof = validateNearFullScalePeaks(row.source.floatPeaks, row.decodedFloatPeaks);
        if (row.nearFullScalePeakProof.status !== "passed") row.failures.push("Near-full-scale float decode has saturation or overshoot; do not hide it with s16 clamping");
      }
      const comments = conversion.destination === "mp3" ? await readId3Metadata(output) : conversion.byteBudget ? await readOggNativeTextBudgetComments(output, conversion.destination)
        : extendedArtworkInspection ? await readOggPictureComments(output, conversion.destination) : await readAudioCommentEntries(output, conversion.destination); row.binaryComments = comments;
      if (conversion.destination === "mp3") {
        row.id3Metadata = validateId3FixtureMetadata(comments, expectedTags, report.artworkImages[conversion.artwork]);
        if (row.id3Metadata.status !== "passed") row.failures.push("Raw ID3 text values or cover bytes/role/description lost or changed");
      }
      if (conversion.standardRepeated) {
        row.standardRepeatedValidation = validateStandardRepeatedAudioComments(comments);
        if (row.standardRepeatedValidation.status !== "passed") row.failures.push("Standard metadata aliases lost, changed, folded or reordered independent values");
        row.metadataCoverage = { scalarFields: 21, repeatedFields: 4, totalSemanticFields: 25,
          allFieldsPreserved: row.output.tags.status === "passed" && row.standardRepeatedValidation.status === "passed" };
      }
      if (conversion.expectedExclusion) row.artworkExclusion = validateArtworkBudgetExclusion(outputProbe, comments, state.warnings);
      if (extendedArtworkInspection && !conversion.expectedExclusion && conversion.artwork) {
        const expected = report.artworkImages[conversion.artwork]; assert.equal(comments.pictures.length, 1);
        assert.equal(comments.pictures[0].imageBytes, expected.bytes); assert.equal(comments.pictures[0].sha256, expected.sha256);
        assert.equal(comments.pictures[0].description, expected.description);
        row.streamingPictureInspection = { ...comments.pictures[0], ...comments.metrics, textBytes: comments.textBytes };
      }
      if (conversion.recoveryAfterExclusions) {
        assert.equal(state.warnings.includes(ARTWORK_BUDGET_EXCLUSION_WARNING), false, "No stale exclusion warning on accepted recovery job");
        assert.equal(index, 2); assert.ok(report.cases.slice(0, 2).every(c => c.status === "passed-small-private-fidelity-and-metadata-case" && c.artworkExclusion?.outputPictures === 0));
        row.samePageRecovery = { twoPreviousExclusionsPassed: true, noContextOrPageRecreation: true, noStaleExclusionWarning: true };
      }
      if (conversion.recoveryAfterIo) {
        assert.equal(state.error, null); assert.deepEqual(state.warnings, []);
        assert.ok(report.cases.slice(0, 2).every(c => c.status === "passed-private-audio-interruption-case"));
        row.samePageIoRecovery = { bothInterruptionsPassed: true, noContextOrPageRecreation: true, noStaleErrorOrWarning: true };
        if (mp3IoRecovery) {
          assert.equal(row.output.sha256, "fd3c70154c11380dd727bd1e7b94d2a530b16deffa30aab36c012e5abcdae293");
          assert.equal(report.cases[0].payloadCancellationProof?.moreThanHeaderReadAndWritten, true);
          assert.equal(row.id3Metadata.status, "passed"); assert.ok(row.repairedGainProof.fullPcmQualityPassed);
          row.samePageMp3IoRecovery = { payloadCancellationAndWriteFailurePassed: true, exactPriorPngOutputControl: true,
            automaticNativeQualityCode: 0, clippingAcceptance: false, publicAcceptance: false };
        }
        if (vorbisIoRecovery) {
          assert.equal(row.output.sha256, "a7c954b7b54cd9512735f22eb31c442205d80fe88c5c2f93448ac9e0ceb70167");
          assert.equal(report.cases[0].byobCancellationProof?.actualPersistentReadPath, true);
          row.samePageVorbisIoRecovery = { byobCancellationAndWriteFailurePassed: true, exactPriorPngOutputControl: true,
            automaticNativeQualityCode: 3, noPageOrContextRecreation: true, noStaleErrorOrWarning: true };
        }
      }
      if (conversion.repeated) {
        row.repeatedValues = comments.entries.filter(s => s.split("=", 1)[0].toLowerCase() === "custom_repeat");
        try { assert.deepEqual(row.repeatedValues, AUDIO_REPEATED_COMMENTS); } catch { row.failures.push("Repeated comment values were folded, overwritten or reordered"); }
      }
      if (conversion.fieldBudget) row.exactFieldBoundary = validateExactMetadataFieldBoundary(comments, fieldFixtures[conversion.fieldBudget]);
      if (conversion.byteBudget) row.exactTextByteBoundary = validateExactNativeTextByteBoundary(comments, byteFixtures[conversion.byteBudget]);
      if (conversion.recoveryAfterBytes) {
        assert.equal(state.error, null); assert.deepEqual(state.warnings, []);
        assert.equal(row.output.sha256, "e00860de6c495310697e32ad31a0fa859cd0c082e5b8921088e33c55f9db71f3");
        assert.equal(report.cases[0].status, "passed-small-private-fidelity-and-metadata-case");
        assert.equal(report.cases[1].status, "passed-private-metadata-byte-rejection-case");
        row.samePageByteRecovery = { exactByteBoundaryAndOneOverRejectionPassed: true, noPageOrContextRecreation: true, noStaleErrorOrWarning: true };
      }
      if (conversion.recoveryAfterMetadata) {
        assert.equal(state.error, null); assert.deepEqual(state.warnings, []);
        assert.equal(row.output.sha256, "e00860de6c495310697e32ad31a0fa859cd0c082e5b8921088e33c55f9db71f3");
        if (!metadataFieldRejectOnly) assert.equal(report.cases[0].status, "passed-small-private-fidelity-and-metadata-case");
        const previous = metadataFieldRejectOnly ? report.cases.slice(0, 2) : report.cases.slice(1, 3);
        assert.equal(previous.length, 2); assert.ok(previous.every(value => value.status === "passed-private-metadata-field-rejection-case"));
        row.samePageMetadataRecovery = { bothNativeRejectionsPassed: true, exactBoundaryIncludedInThisRun: !metadataFieldRejectOnly,
          noPageOrContextRecreation: true, noStaleErrorOrWarning: true };
      }
      row.status = row.failures.length ? "failed" : "passed-small-private-fidelity-and-metadata-case";
      if (conversion.largeStereo && !row.failures.length) row.status = "passed-full-size-private-q7-case-not-public-qualification";
      if (artworkBenchmark) row.validationDiagnostics.afterValidation = await validationCheckpoint();
      if (physicalBinding) await assertOpfsOutputValidationBackingUnchanged(physicalBinding);
      }
      if (artworkBenchmark ? index === 0 || index === selectedCases.length - 1 : index === 0 || conversion.repeated || conversion.interruption || conversion.largeStereo || conversion.standardRepeated || mp3ArtworkMetadata) await screenshot(conversion, index, row);
    } catch (error) { row.failures.push(String(error.stack ?? error).slice(0, 4096)); }
    finally {
      if (entryName) await page.evaluate(async name => { await (await navigator.storage.getDirectory()).removeEntry(name); }, entryName);
      if (outputIdentity) { const current = await lstat(output, { bigint: true }); assert.equal(current.dev, outputIdentity.dev); assert.equal(current.ino, outputIdentity.ino); await unlink(output); }
      row.disposableOutputRemoved = true;
    }
    if (artworkBenchmark && row.validationDiagnostics) row.validationDiagnostics.afterCleanup = await validationCheckpoint();
    if (conversion.largeStereo) {
      await page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready", null, { timeout: 15000 });
      await pause(2100); await snapshot(); const sample = tail.findLast(value => value.privateBytes !== null);
      assert.ok(sample); row.cleanupPrivateBytes = sample.privateBytes;
      row.cleanupDeltaFromLoadedMiB = (sample.privateBytes - report.loadedIdle.privateBytes) / 1048576;
      assert.ok(row.cleanupDeltaFromLoadedMiB <= 96, "Unchanged legacy loaded-idle cleanup96MiB allowance exceeded");
      console.log(JSON.stringify({ stage: "large-case-terminal-and-cleanup", repeat: index + 1, status: row.status, engineElapsedMs: row.engineElapsedMs, outputBytes: row.output?.bytes }));
      if (row.status !== "passed-full-size-private-q7-case-not-public-qualification") throw new Error("First invalid large result retained; do not repeat it unchanged");
    }
    await snapshot(); recordMemory(); if (report.memory.incrementalPrivateMiB > 250) throw new Error("Whole Chromium250MiB gate failed; retain completed fidelity evidence without promotion");
  }
  phase("recovery"); await pause(2100); await snapshot(); recordMemory();
  assert.deepEqual(report.network.forbidden, []); assert.deepEqual(await pins(), report.sources); assertInstalledChromePinsEqual(report.browser, await inspectInstalledChromePin());
  assert.ok(report.network.nativeGlueRequests > 0 && report.network.nativeWasmRequests > 0, "Fresh context must request the staged audited native assets");
  assert.equal(report.cases.length, selectedCases.length);
  if (automaticVorbisRepair) {
    assert.ok(report.cases.every(row => row.status === (largeVorbisRepeat ? "passed-full-size-private-q7-case-not-public-qualification" : "passed-small-private-fidelity-and-metadata-case") && row.actualAutomaticQualityArgument?.nativeCode === 3));
    report.automaticVorbisQualityRepaired = largeVorbisRepeat ? "passed-three-full-size-private-q7-repeats-not-public-qualification" : "passed-four-small-private-automatic-cases-not-public-requalification";
  }
  assert.ok(largeVorbisRepeat ? report.cases.every(c => c.status === "passed-full-size-private-q7-case-not-public-qualification") : metadataBudget ? report.cases.every(c => c.metadataFailure ? c.status === (c.metadataFailure === "text-bytes" ? "passed-private-metadata-byte-rejection-case" : "passed-private-metadata-field-rejection-case") : c.status === "passed-small-private-fidelity-and-metadata-case")
    : audioIoRecovery || vorbisIoRecovery || mp3IoRecovery ? report.cases.every(c => c.interruption ? c.status === "passed-private-audio-interruption-case" : c.status === "passed-small-private-fidelity-and-metadata-case")
    : report.cases.every(c => c.status === "passed-small-private-fidelity-and-metadata-case"));
  if (vorbisIoRecovery) report.vorbisIoRecovery = "passed-three-private-interruption-and-recovery-jobs-not-public-qualification";
  assert.ok(report.memory.incrementalPrivateMiB <= 250); report.status = largeVorbisRepeat
    ? "passed-three-full-size-private-repeats-not-promotion" : "passed-selected-small-private-cases-not-promotion";
} catch (error) { report.status = "failed"; report.failures.push(String(error.stack ?? error).slice(0, 8192)); }
finally {
  clearInterval(monitorTimer); await pending;
  if (monitor && journal) {
    let coverageFailure = null;
    try { await snapshot(); recordMemory(); report.memoryObserverOwnership = monitor.ownershipSummary(); } catch (error) { coverageFailure = String(error); }
    try { await monitor.close(); monitor = null; } catch (error) { coverageFailure ??= String(error); }
    try { const receipt = await journal.close(); report.losslessMemoryJournal = await compactLosslessNativeMemoryJournal(coverageFailure
      ? { ...receipt, complete: false, failure: coverageFailure, conversionAcceptance: false } : receipt);
      if (coverageFailure) throw new Error(coverageFailure);
    } catch (error) { report.failures.push("Memory finalization: " + String(error)); report.status = "failed"; }
  }
  if (monitorFailure) { report.failures.push(String(monitorFailure)); report.status = "failed"; }
  if (report.memory?.incrementalPrivateMiB > 250 || report.network.forbidden.length) report.status = "failed";
  if (benchmarkSession) await benchmarkSession.detach().catch(error => { report.failures.push("Diagnostic session close: " + String(error)); report.status = "failed"; });
  await finishOwnedCleanup([
    async () => { if (monitor) await monitor.close(); }, async () => { if (context) await context.close(); else if (browser) await browser.close(); },
    async () => { if (server && server.exitCode === null) { assert.deepEqual(await queryProcessIdentity(server.pid), serverIdentity);
      await execute("taskkill.exe", ["/PID", String(server.pid), "/T", "/F"], { cwd: root, env, windowsHide: true, timeout: 15000, maxBuffer: 16384 }); } },
  ]).catch(error => { report.failures.push(String(error)); report.status = "failed"; });
  if (observer) { report.networkObserver = observer.summary(); observer.close(); }
  const cleanupIdentities = new Map(identities.map(i => [i.pid + ":" + i.createdAt, i]));
  for (const identity of report.losslessMemoryJournal?.summary?.native?.identities ?? []) cleanupIdentities.set(identity.pid + ":" + identity.createdAt, identity);
  report.processCleanup = [];
  for (const identity of cleanupIdentities.values()) report.processCleanup.push(await observeOwnedProcessExit(identity));
  let restored = true;
  await finishOwnedCleanup(staged.filter(r => r.staged).map(r => async () => {
    const current = await lstat(r.target, { bigint: true }); assert.equal(current.dev, r.identity.dev); assert.equal(current.ino, r.identity.ino); assert.equal(sha(await readFile(r.target)), r.candidate);
    await copyFile(r.backup, r.target); assert.equal(sha(await readFile(r.target)), r.original);
  })).catch(error => { restored = false; report.failures.push(String(error)); report.status = "failed"; });
  try {
    if (originalHash) { assert.equal(await hashFile(path.join(root, "test.mkv")), originalHash); report.protectedOriginalUnchanged = true; }
    assert.ok(report.processCleanup.every(c => c.status === "owned-identity-absent")); assert.ok(restored);
    await runtime.close(); report.cleanup = { allRecordedBirthsAbsent: true, publishedAssetsNeverChanged: true, stagedPrivateAssetsRestored: true, ownedProfileFixturesOutputsRemoved: true };
  } catch (error) { report.failures.push(String(error)); report.status = "failed"; }
  report.serverLog = serverLog; report.phaseChanges = phases; report.finishedAt = new Date().toISOString();
  const raw = Buffer.from(JSON.stringify(report)); assert.ok(raw.length <= 8 * 1048576); const packed = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(packed), raw);
  const archive = path.join(root, "outputs/reports", stamp + "-audio-metadata-production-runtime.json.gz"); await mkdir(path.dirname(archive), { recursive: true }); await writeFile(archive, packed, { flag: "wx" });
  assert.equal(sha(await readFile(archive)), sha(packed));
  const receipt = { schemaVersion: 1, executedHead: report.executedHead, status: report.status, scope: report.scope, publicAcceptance: false, fullMetadataAcceptance: false,
    archive: { path: path.relative(root, archive).replaceAll(path.sep, "/"), bytes: packed.length, sha256: sha(packed), restoredBytes: raw.length, restoredSha256: sha(raw) },
    sourcePins: Object.keys(report.sources ?? {}).length, artifactManifestSha256: report.artifact?.manifestSha256, diskProof: report.diskProof,
    memory: report.memory, memoryObserverOwnership: report.memoryObserverOwnership, benchmark: report.benchmark, cases: report.cases.map(c => ({ name: c.name, status: c.status, requestedQuality: c.requestedQuality, browserElapsedMs: c.browserElapsedMs,
      engineElapsedMs: c.engineElapsedMs, benchmarkIteration: c.benchmarkIteration, benchmarkWarmup: c.benchmarkWarmup,
      validationDiagnostics: c.validationDiagnostics,
      physicalValidation: c.physicalValidation,
      metadataFailure: c.metadataFailure, metadataFailureProof: c.metadataFailureProof, metadataErrorVisible: c.metadataErrorVisible,
      exactFieldBoundary: c.exactFieldBoundary, samePageMetadataRecovery: c.samePageMetadataRecovery,
      exactTextByteBoundary: c.exactTextByteBoundary, samePageByteRecovery: c.samePageByteRecovery,
      actualAutomaticQualityArgument: c.actualAutomaticQualityArgument, automaticQualityNoticeVisible: c.automaticQualityNoticeVisible,
      largeStereo: c.largeStereo, cleanupPrivateBytes: c.cleanupPrivateBytes, cleanupDeltaFromLoadedMiB: c.cleanupDeltaFromLoadedMiB,
      actualInputTransport: c.actualInputTransport,
      byobCancellationProof: c.byobCancellationProof, samePageVorbisIoRecovery: c.samePageVorbisIoRecovery,
      standardRepeatedValidation: c.standardRepeatedValidation, metadataCoverage: c.metadataCoverage,
      id3Metadata: c.id3Metadata,
      gainDiagnostic: c.gainDiagnostic, sameRetainedAutomaticBytesAndUnmodifiedPcm: c.sameRetainedAutomaticBytesAndUnmodifiedPcm,
      repairedGainProof: c.repairedGainProof,
      highAmplitude: c.highAmplitude, decodedFloatPeaks: c.decodedFloatPeaks, nearFullScalePeakProof: c.nearFullScalePeakProof,
      failures: c.failures, fidelity: c.fidelity, outputBytes: c.output?.bytes, outputSha256: c.output?.sha256,
      tagsPreserved: c.output?.tags?.fields.filter(f => f.status === "preserved").length, repeatedValues: c.repeatedValues, artwork: c.artwork,
      streamingPictureInspection: c.streamingPictureInspection,
      artworkExclusion: c.artworkExclusion, exclusionWarningVisible: c.exclusionWarningVisible, samePageRecovery: c.samePageRecovery,
      interruption: c.interruption, interruptionProof: c.interruptionProof, interruptionErrorVisible: c.interruptionErrorVisible,
      storageBefore: c.storageBefore, storageAfter: c.storageAfter, samePageIoRecovery: c.samePageIoRecovery,
      payloadCancellationProof: c.payloadCancellationProof, samePageMp3IoRecovery: c.samePageMp3IoRecovery,
      disposableOutputRemoved: c.disposableOutputRemoved })),
    losslessJournal: report.losslessMemoryJournal ? { file: path.relative(root, report.losslessMemoryJournal.file).replaceAll(path.sep, "/"), records: report.losslessMemoryJournal.records,
      sha256: report.losslessMemoryJournal.sha256, archiveSha256: report.losslessMemoryJournal.archiveSha256, complete: report.losslessMemoryJournal.complete } : null,
    failures: report.failures, network: report.network, cleanup: report.cleanup, protectedOriginalUnchanged: report.protectedOriginalUnchanged };
  const destination = path.join(root, "evidence", stamp + "-audio-metadata-fidelity-result.json"); await writeFile(destination, JSON.stringify(receipt, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ receipt: destination, status: report.status, cases: receipt.cases.map(c => ({ name: c.name, status: c.status, failures: c.failures })), memory: report.memory?.incrementalPrivateMiB, cleanup: report.cleanup }));
  if (report.status === "failed") process.exitCode = 1;
}
