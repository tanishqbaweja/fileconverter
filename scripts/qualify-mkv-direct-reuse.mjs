// Private normal-service browser A/B; this small control is not a speed benchmark.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { copyFile, lstat, readFile, readdir, realpath, stat, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { promisify } from "node:util";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { startClassifiedChromiumMemoryMonitor } from "./lib/birth-type-capture.mjs";
import { stableWindow } from "./lib/chromium-private-memory.mjs";
import { inspectInstalledChromePin, assertInstalledChromePinsEqual } from "./lib/installed-chrome-pin.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { cleanupOwnedChromium, queryObservedPidCensus } from "./lib/owned-chromium-cleanup.mjs";
import { reconcileChromiumBirths } from "./lib/reconcile-chromium-births.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { boundedErrorDetails } from "./lib/bounded-error-details.mjs";
import { buildMkvDirectReuseOverlay } from "./lib/mkv-direct-reuse-overlay.mjs";
import { isCompatibilityStaticPath } from "./lib/installed-compatibility-plan.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";
import { selectOwnedLocalBrowserFile } from "./lib/select-owned-local-browser-file.mjs";
import { encodeBoundedValidationChunk } from "./lib/bounded-validation-chunk.mjs";
import { bindOpfsOutputValidationBacking, bindLargeAudioOutputValidationBacking, bindProtectedMkvOutputValidationBacking, bindScalingMkvOutputValidationBacking, assertOpfsOutputValidationBackingUnchanged } from "./lib/opfs-output-validation-backing.mjs";
import { cancelBrowserConversionBeforeCleanup } from "./lib/cancel-browser-conversion-before-cleanup.mjs";
import { compareSmallMkvPacketClocks } from "./lib/mkv-direct-packet-clocks.mjs";
import { readMkvMp4TimelineBoxes } from "./lib/mkv-mp4-timeline-boxes.mjs";
import { loadMkvEditListBuildArtifact } from "./lib/mkv-edit-list-build-artifact.mjs";
import { validateCopiedAudioTiming } from "./lib/copied-audio-timing.mjs";
import { mkvStagedReference, mkvHevcRegressionFixture, mkvFixedHevcReference, readMkvExactAacStagedReference, readMkvHevcRegressionReference, readMkvFixedHevcReference } from "./lib/mkv-exact-aac-staged-reference.mjs";
import { compareMkvVideoPackets, probeMkvVideoPackets } from "./lib/mkv-streaming-video-fidelity.mjs";
import { compareMkvSustainedAac, probeMkvSustainedAac } from "./lib/mkv-sustained-aac-fidelity.mjs";
import { selectExactLocalOriginal } from "./lib/mpeg2-original-gate.mjs";
import { assertMkvProtectedSource, assertMkvProtectedOutput, mkvProtectedCopy } from "./lib/mkv-protected-copy-contract.mjs";
import { assertSameMkvNativeBuild, protectedRepeatReference, readProtectedRepeatReference, summarizeProtectedWindow } from "./lib/mkv-protected-repeat-contract.mjs";
import { decodeCompleteProtectedVideo, decodeFreshProtectedVideo } from "./lib/mkv-full-video-decode.mjs";
import { complexMkvFixture, bframeMkvFixture, positiveBFrameMkvFixture, assertBFrameMkvSource, compareComplexMkvPackets, assertComplexMkvMetadata, assertComplexMkvStructure } from "./lib/mkv-complex-fidelity.mjs";
import { validateComplexFragmentedTimeline } from "./lib/mkv-complex-presentation-timeline.mjs";
import { h264VfrWrapperSha256 } from "../media/ffmpeg/mkv-h264-vfr-candidate.mjs";
import { h264ProbeWrapperSha256 } from "../media/ffmpeg/mkv-h264-probe-decoder-candidate.mjs";
import { h264StartupWrapperSha256 } from "../media/ffmpeg/mkv-h264-startup-candidate.mjs";
import { assertMkvStartupCore, readStartupComplexReference, startupComplexReference,
  readStartupSmallRegressions, startupSmallRegressions, readStartupProtectedReference, protectedCompleteVideoReference } from "./lib/mkv-startup-core-reference.mjs";
import { createSmallMkvScalingLoop } from "./lib/mkv-scaling-fixture.mjs";
import { compareMkvGapAwareVideoPackets } from "./lib/mkv-gap-aware-video-fidelity.mjs";
import { hevcKnownDtsWrapperSha256 } from "../media/ffmpeg/mkv-hevc-known-dts-candidate.mjs";
import { headerParserH264Regression, assertHevcHeaderParserCore, readHevcHeaderLoopReference, hevcHeaderLoopReference, assertStartupDtsDisclosure } from "./lib/mkv-hevc-header-core-reference.mjs";
import { headerCoreH264References, readHeaderCoreH264Regressions, readPriorCompleteProtectedVideo, canInheritCompleteProtectedVideo,
  headerProtectedReference, readHeaderProtectedReference } from "./lib/mkv-header-protected-reference.mjs";
import { MKV_RETENTION_LIMITS, createMkvRetentionDiagnostic } from "./lib/mkv-retention-diagnostic.mjs";

assert.equal(process.platform, "win32");
const stagedDiagnostic = process.argv[2] === "--staged-clock-diagnostic";
const terminalDiagnostic = process.argv[2] === "--h264-vfr-error-diagnostic";
const fixedHevcBaseline = process.argv[2] === "--exact-aac-fixed-hevc-baseline";
const startupHevcControl = process.argv[2] === "--h264-startup-hevc-control";
const startupSimpleControl = process.argv[2] === "--h264-startup-no-b-control";
const headerH264Regression = headerParserH264Regression(process.argv.slice(2));
const headerProtectedRetention = process.argv[2] === "--hevc-header-parser-protected-retention";
const headerProtectedRepeats = headerProtectedRetention || process.argv[2] === "--hevc-header-parser-protected-repeats";
const headerProtected = headerProtectedRepeats || process.argv[2] === "--hevc-header-parser-protected";
const hevcHeaderParser = headerProtected || !!headerH264Regression || process.argv[2] === "--hevc-header-parser-loop-source-control";
const hevcKnownDts = hevcHeaderParser || process.argv[2] === "--hevc-known-dts-loop-source-control";
const scalingLoopControl = ["--hevc-header-parser-loop-source-control", "--hevc-known-dts-loop-source-control", "--h264-startup-loop-source-control"].includes(process.argv[2]);
const startupProtectedRepeats = process.argv[2] === "--h264-startup-protected-repeats";
const startupProtected = startupProtectedRepeats || process.argv[2] === "--h264-startup-protected";
const probeHevcControl = startupHevcControl || process.argv[2] === "--h264-probe-decoder-hevc-control";
const pinnedHevc = fixedHevcBaseline || probeHevcControl;
const positiveStartCandidate = process.argv[2] === "--h264-startup-positive";
const startupHeaderDiagnostic = process.argv[2] === "--h264-startup-header-diagnostic";
const startupCandidate = startupHeaderDiagnostic || positiveStartCandidate || process.argv[2] === "--h264-startup-bframes";
const startupCore = headerProtected || scalingLoopControl || startupProtected || startupCandidate || startupHevcControl || startupSimpleControl;
const bframeControl = startupCandidate || process.argv[2] === "--h264-probe-decoder-bframes";
const selectedComplexFixture = positiveStartCandidate ? positiveBFrameMkvFixture : bframeControl ? bframeMkvFixture : complexMkvFixture;
const probeDecoder = startupCore || bframeControl || probeHevcControl || process.argv[2] === "--h264-probe-decoder-complex";
const h264Vfr = probeDecoder || terminalDiagnostic || process.argv[2] === "--h264-vfr-complex";
const complexTimeline = !headerProtected && !scalingLoopControl && !startupProtected && ((h264Vfr && !probeHevcControl) || process.argv[2] === "--edit-list-aac-complex");
const sustained = process.argv[2] === "--edit-list-aac-sustained";
const protectedRepeats = headerProtectedRepeats || startupProtectedRepeats || process.argv[2] === "--edit-list-aac-protected-repeats";
const protectedFullDecode = process.argv[2] === "--edit-list-aac-protected-full-decode";
const protectedMode = headerProtected || startupProtected || protectedFullDecode || protectedRepeats || process.argv[2] === "--edit-list-aac-protected";
const compareDestinations = sustained || process.argv[2] === "--edit-list-aac-destination-control";
const exactAacCandidate = pinnedHevc || probeDecoder || complexTimeline || protectedMode || compareDestinations || process.argv[2] === "--edit-list-aac-candidate";
const editListCandidate = exactAacCandidate || process.argv[2] === "--edit-list-candidate";
assert.equal(process.argv.length, editListCandidate ? headerH264Regression ? 6 : 5 : stagedDiagnostic ? 3 : 2);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile), profileId = "mkv-to-mp4";
const syntheticName = scalingLoopControl ? "within-test-scaled-hevc" : complexTimeline ? "within-test-complex-remux-source" : sustained ? "within-test-sustained-hevc-aac" : "within-test-synthetic-hevc-aac";
const mib = 1048576, minSustainedBytes = 128 * mib, maxSustainedBytes = 256 * mib;
const smallControl = { file: "evidence/2026-11-08T01-21-27-483Z-mkv-exact-aac-destination-control.json",
  sha256: "3eca8a3b925ef55fb22cb444f42a237ab12ed412c6c613d06264903d22e777bb" };
const sustainedControl = { file: "evidence/2026-11-08T13-13-11-767Z-mkv-exact-aac-sustained.json",
  sha256: "82baa7d9f3543fc653e162ef73d012a6cdc9cf2d461fb6672f43a39de4d28080" };
const sha = bytes => createHash("sha256").update(bytes).digest("hex"), stamp = new Date().toISOString().replaceAll(/[:.]/g, "-");
const report = { schemaVersion: 1, status: "running", scope: "Small real MKV-to-MP4 packet copy. Two private async direct arms; not the public staged route, original-file, speed, or promotion.",
  headed: false, browserServicesDisabled: false, peakLimitMiB: 250, cleanupLimitMiB: 96, nativeConversionUsed: false,
  originalMediaSelected: false, productionFilesReplaced: false, speedGainProven: false, publicAcceptance: false, arms: [], failures: [] };
if (stagedDiagnostic) report.scope = "One unchanged public staged-handle MKV-to-MP4 small-fixture diagnostic against retained private output hashes; not a rerun of the direct A/B or acceptance of shifted clocks.";
if (editListCandidate) report.scope = "Unpublished MKV edit-list tools only, normal staged worker and same bounded HEVC/AAC fixture. Not original-file, speed or public acceptance.";
if (exactAacCandidate) report.exactAacCandidate = true;
if (compareDestinations) report.scope = "Matched small-fixture staged, direct-fresh and direct-reuse controls, one exact AAC-correct Wasm; not a sustained throughput or promotion test.";
if (sustained) report.scope = "Matched 128–256 MiB synthetic HEVC/AAC staged and direct saves; no original-file, 10 GB, manual-browser or promotion claim.";
if (protectedMode) report.scope = "One original 2.96 GB browser direct-reuse remux, whole-file packet/PCM and sampled independent video decode; no repeat, production promotion or 10 GB claim.";
if (protectedRepeats) report.scope = "Three same-page protected original remuxes plus one clean-session repeat, each full-hash matched to independent packet/PCM evidence; no full-video-decode or public claim.";
if (protectedFullDecode) report.scope = "One real protected browser remux, full-file identity to prior packet/PCM evidence and independent complete video decode; not a public release or scaling claim.";
if (complexTimeline) report.scope = "Existing complex VFR/two-AAC fixture, exact unpublished candidate, direct-reuse browser pipeline, strict packet/trim/decoded-content/metadata and recovery gates; not a speed, original-file, scale or public claim.";
if (h264Vfr) report.h264VfrCandidate = true;
if (probeDecoder) report.h264ProbeDecoderCandidate = true;
if (bframeControl) {
  report.h264BFrameControl = true;
  report.scope = "Pinned H.264 B-frame/VFR/two-AAC source on the authenticated probe core, all compressed packet decode-order identity, presentation clocks, known source DTS, trim/decoded content/metadata/recovery/memory gates; not nonzero-start, original-file, scale or public acceptance.";
}
if (startupCandidate) {
  report.h264StartupDtsCandidate = true;
  report.scope = "Pinned B-frame/VFR/two-AAC source on isolated bounded startup-DTS candidate; all PTS/known DTS/payload/order/trim/decoded-content/metadata/recovery/memory gates, initial missing-DTS scheduling explicitly disclosed; not nonzero-start, original-file, scale or public acceptance.";
}
if (startupHevcControl || startupSimpleControl) {
  report.h264StartupDtsCandidate = true;
  report.startupCoreRegression = startupHevcControl ? "hevc" : "h264-no-b-frames";
  report.scope = "Same pinned HEVC or no-B-frame VFR input on exact startup-DTS core, full output-byte identity to independently qualified older-core baseline plus all original fidelity/recovery/full-tree-memory checks; no original/scale/speed/public acceptance.";
}
if (startupProtected) {
  report.h264StartupDtsCandidate = true; report.startupProtectedCandidate = true;
  report.scope = "Original 2.96GB browser remux on exact changed startup core, fresh whole-tree memory and whole-output SHA-256 identity to prior complete independent packet/PCM/video validators. Different engine under test, not a fresh full native decode, public release or scale claim.";
}
if (scalingLoopControl) {
  report.h264StartupDtsCandidate = true; report.scalingLoopSourceControl = true;
  report.scope = "Small real-media loop-join construction control on exact startup core, strict existing packet/clock/PCM/full-decode and250MiB gates. New finite read-only validation extent, not actual >4GB/near10GB scaling, native conversion or public acceptance.";
}
if (hevcKnownDts && scalingLoopControl) {
  report.hevcKnownDtsCandidate = true;
  report.scope = "Same real12MB HEVC/AAC loop-source control on newly authenticated known-DTS core. Every payload/knownPTS/DTS at1ms, adjacent output decode intervals, exact trim/complete decoded content/recovery and unchanged full-tree memory; not >4GB/near10GB or public acceptance.";
}
if (hevcHeaderParser) report.hevcHeaderParserCandidate = true;
if (positiveStartCandidate) {
  report.positiveStartCandidate = true;
  report.scope = "Exact +5s B-frame/VFR/two-AAC fixture on bounded startup-DTS core, unchanged packet/known-DTS/PTS/trim/decoded-content/metadata/recovery/memory gates, packet-derived header semantics and empty edit delays; no timestamp rebasing, original-file/scale/public acceptance or manual-headed claim.";
}
if (startupHeaderDiagnostic) {
  report.diagnosticOnly = true;
  report.scope = "One diagnostic output on the startup candidate: collect all packet/known-clock/PCM/decode/edit evidence before the SAME failing raw-duration assertion; no header/fidelity/memory/recovery acceptance claim.";
}
if (probeHevcControl) report.scope = "Exact pinned HEVC/AAC source on the changed probe core, whole-output identity to a same-input independently validated old-core baseline plus full fidelity/recovery/memory; not historical regenerated input, speed, scale or public acceptance.";
if (fixedHevcBaseline) report.scope = "Unchanged previously validated exact-AAC core on the pinned bitexact HEVC source, independently verified content and deterministic recovery; prepares a same-input baseline, not speed or new-core acceptance.";
if (terminalDiagnostic) {
  report.diagnosticOnly = true;
  report.scope = "One bounded browser-engine error capture for the failed H.264 candidate; no fidelity, recovery, speed or acceptance claim.";
}
if (headerH264Regression) {
  report.hevcKnownDtsCandidate = true; report.hevcHeaderParserRegression = headerH264Regression;
  report.scope = "Existing pinned H264 no-B/B-frame/+5s regression on exact corrected HEVC header-parser core. Unchanged all-packet/known-clock/PTS/metadata/trim/full-decoded-content/recovery and250MiB gates, no replay of accepted HEVC loop or claim of original/scale/speed/public acceptance.";
}
if (headerProtected) {
  report.hevcHeaderProtectedCandidate = true;
  report.scope = "Actual original2.96GB remux on exact corrected header-parser core after current-core small regressions. Fresh all-packet/clocks/codec-configuration/PCM/structure/trim checks; prior complete-video proof inheritable ONLY through entire-output byte identity, otherwise fresh complete independent decode. No new-original-repeat, scale, speed or public acceptance.";
}
if (headerProtectedRepeats) {
  report.hevcHeaderProtectedRepeats = true;
  report.scope = "Three same-page original remuxes and one clean-session repeat on exact corrected header core, each complete-output hash bound to the fresh current-core all-packet/codec/PCM/complete-video proof. Original blank/loaded-idle baselines unchanged; outputs removed before next run. Not fresh native decoding, speed, scale or release acceptance.";
}
if (headerProtectedRetention) {
  report.diagnosticOnly = true; report.hevcHeaderProtectedRetention = true;
  report.scope = "Six same-page original remuxes, exact current native and every output byte bound to fresh complete content proof; bounded realm/DOM/allocator checkpoints investigate rising cleanup. Instrumentation perturbs memory, no forced GC, no release acceptance, no fresh full decode, no speed or scale claim.";
}
const hashFile = async file => {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(file, { highWaterMark: 262144 })) hash.update(bytes);
  return hash.digest("hex");
};
const prefix = `evidence/${stamp}-mkv-${headerProtected ? `hevc-header-core-protected${headerProtectedRetention ? "-retention-diagnostic" : headerProtectedRepeats ? "-repeats" : ""}` : headerH264Regression ? `hevc-header-core-${headerH264Regression}` : hevcHeaderParser ? "hevc-header-parser-loop-source-control" : hevcKnownDts ? "hevc-known-dts-loop-source-control" : scalingLoopControl ? "startup-core-loop-source-control" : startupProtectedRepeats ? "startup-core-protected-repeats" : startupProtected ? "startup-core-protected" : startupHevcControl ? "startup-core-hevc-control" : startupSimpleControl ? "startup-core-no-b-control" : fixedHevcBaseline ? "fixed-input-hevc-baseline" : probeHevcControl ? "probe-decoder-hevc-control" : positiveStartCandidate ? "startup-dts-positive" : startupCandidate ? "startup-dts-bframes" : bframeControl ? "probe-decoder-bframes" : complexTimeline ? "exact-aac-complex" : protectedFullDecode ? "exact-aac-protected-full-decode" : protectedRepeats ? "exact-aac-protected-repeats" : protectedMode ? "exact-aac-protected" : sustained ? "exact-aac-sustained" : compareDestinations ? "exact-aac-destination-control" : exactAacCandidate ? "edit-list-aac-candidate" : editListCandidate ? "edit-list-candidate" : stagedDiagnostic ? "staged-clock" : "direct-reuse"}`;
const ffmpeg = "C:/ffmpeg/bin/ffmpeg.exe", ffprobe = "C:/ffmpeg/bin/ffprobe.exe";
const runNative = (file, args, env, timeout = 90000) => execute(file, args, { cwd: root, env, windowsHide: true, timeout, maxBuffer: 2097152 });
const probe = async (file, env) => JSON.parse((await runNative(ffprobe, ["-v", "error", "-count_packets", "-show_streams", "-show_format", "-of", "json", file], env)).stdout);
const probeProtected = async (file, env) => JSON.parse((await runNative(ffprobe, ["-v", "error", "-show_streams", "-show_format", "-show_chapters", "-of", "json", file], env)).stdout);
const complexPackets = async (file, env) => JSON.parse((await runNative(ffprobe, ["-v", "error", "-show_packets", "-show_entries",
  "packet=stream_index,pts_time,dts_time,duration_time,data_hash:packet_side_data=side_data_type,skip_samples,discard_padding",
  "-show_data_hash", "sha256", "-of", "json", file], env)).stdout).packets.filter(p => p.stream_index <= 2);
const complexDecodedHashes = async (file, env) => {
  const result = (await runNative(ffmpeg, ["-v", "error", "-xerror", "-threads", "1", "-noautorotate", "-i", file,
    "-map", "0:v:0", "-map", "0:a:0", "-map", "0:a:1", "-c:v", "rawvideo", "-pix_fmt", "yuv420p",
    "-fps_mode", "passthrough", "-c:a", "pcm_s16le", "-f", "streamhash", "-hash", "sha256", "-"], env)).stdout.trim();
  assert.match(result, /^0,v,SHA256=[a-f0-9]{64}\r?\n1,a,SHA256=[a-f0-9]{64}\r?\n2,a,SHA256=[a-f0-9]{64}$/);
  return result;
};
const packetClocks = async (file, env) => JSON.parse((await runNative(ffprobe,
  ["-v", "error", "-show_packets", "-show_entries", "packet=stream_index,pts_time,dts_time", "-of", "json", file], env)).stdout).packets;
const packets = async (file, env) => (await runNative(ffmpeg,
  ["-v", "error", "-i", file, "-map", "0:v:0", "-map", "0:a:0", "-c", "copy", "-f", "streamhash", "-hash", "sha256", "-"], env)).stdout.trim();
const aacPackets = async (file, env) => JSON.parse((await runNative(ffprobe, ["-v", "error", "-select_streams", "a:0", "-show_packets",
  "-show_entries", "packet=stream_index,pts_time,dts_time,duration_time:packet_side_data=side_data_type,skip_samples,discard_padding", "-of", "json", file], env)).stdout).packets;
const decodedPcm = async (file, env) => {
  const result = (await runNative(ffmpeg, ["-v", "error", "-xerror", "-threads", "1", "-i", file,
    "-map", "0:a:0", "-c:a", "pcm_s16le", "-f", "streamhash", "-hash", "sha256", "-"], env, protectedMode ? 480000 : 90000)).stdout.trim();
  assert.match(result, /^0,a,SHA256=[a-f0-9]{64}$/i);
  return result;
};
const disk = await statfs(root), diskRequired = (protectedMode ? 8192 : sustained ? 2048 : 512) * mib;
assert.ok(disk.bavail * disk.bsize >= diskRequired, "Insufficient repository disk scratch for the selected case");
if (sustained || protectedMode) report.diskPreflight = { availableBytes: disk.bavail * disk.bsize, requiredBytes: diskRequired };
const protectedPath = path.join(root, "test.mkv");
const original = async () => {
  const info = await lstat(protectedPath);
  assert.ok(info.isFile() && !info.isSymbolicLink());
  assert.equal((await realpath(protectedPath)).toLowerCase(), protectedPath.toLowerCase());
  return { bytes: info.size, sha256: await hashFile(protectedPath) };
};

async function validateProtectedOutput(fixture, output, bytes, baseline, warnings, env, row) {
  const validation = row.validation = { outputSha256: await hashFile(output) };
  const inspected = await probeProtected(output, env);
  validation.structure = assertMkvProtectedOutput(baseline.probe, inspected, warnings, bytes);
  validation.serializedTimeline = await readMkvMp4TimelineBoxes(output, { protectedPrefix: true });
  assert.deepEqual(validation.serializedTimeline.tracks.map(t => [t.kind, t.editListPresent]), [["vide", true], ["soun", true]]);
  assert.equal(validation.serializedTimeline.tracks[1].edits[0].mediaTimeTicks, String(mkvProtectedCopy.primingSamples));
  if (headerProtectedRepeats) {
    assert.equal(bytes, baseline.protectedReference.outputBytes);
    assert.equal(validation.outputSha256, baseline.protectedReference.outputSha256, "Current-core repeat changed independently validated complete output");
    assert.ok(validation.structure.durationDeltaSeconds < 0.05);
    validation.independentValidation = { ...baseline.protectedReference,
      method: "complete current disk-output byte identity to current-native all-packet/codec/PCM/complete-video proof; no new native decode" };
    validation.fullVideoDecode = false; validation.fullVideoDecodeInheritedThroughWholeOutputIdentity = true;
    validation.candidateGate = { passed: true }; return;
  }
  if (headerProtected) {
    validation.video = await compareMkvGapAwareVideoPackets(probeMkvVideoPackets(fixture, 0, { cwd: root, env }),
      probeMkvVideoPackets(output, 0, { cwd: root, env }), { sourceIndex: 0, outputIndex: 0, sourceReorderDepth: baseline.probe.streams[0].has_b_frames });
    assert.equal(validation.video.packets, mkvProtectedCopy.videoPackets);
    validation.aac = await compareMkvSustainedAac(probeMkvSustainedAac(fixture, { cwd: root, env }), probeMkvSustainedAac(output, { cwd: root, env }));
    assert.equal(validation.aac.packets, 289221); assert.equal(validation.aac.initialSkipSamples, mkvProtectedCopy.primingSamples);
    const codecHashes = async file => {
      const data = JSON.parse((await runNative(ffprobe, ["-v", "error", "-show_streams", "-show_data_hash", "sha256", "-show_entries",
        "stream=index,codec_name,extradata_size,extradata_hash:stream_tags=:stream_disposition=", "-of", "json", file], env)).stdout);
      return data.streams.filter(s => s.index < 2).map(s => {
        assert.match(s.extradata_hash, /^SHA256:[a-f0-9]{64}$/); assert.ok(s.extradata_size > 0 && s.extradata_size <= 262144);
        return { index: s.index, codec: s.codec_name, bytes: s.extradata_size, sha256: s.extradata_hash };
      });
    };
    validation.codecConfiguration = { source: await codecHashes(fixture), output: await codecHashes(output) };
    assert.deepEqual(validation.codecConfiguration.output, validation.codecConfiguration.source, "Codec initialization bytes changed");
    validation.aac.sourcePcm = await decodedPcm(fixture, env); validation.aac.outputPcm = await decodedPcm(output, env);
    assert.equal(validation.aac.outputPcm, validation.aac.sourcePcm, "Protected HE-AAC decoded PCM differs");
    assert.ok(validation.structure.durationDeltaSeconds < 0.05);
    const prior = baseline.priorCompleteVideo;
    if (canInheritCompleteProtectedVideo(prior, bytes, validation.outputSha256)) {
      validation.independentValidation = { ...prior, method: "prior complete video decode bound ONLY by entire current output byte identity; fresh packet/PCM/codec checks above" };
      validation.fullVideoDecode = false; validation.fullVideoDecodeInheritedThroughWholeOutputIdentity = true;
    } else {
      try {
        validation.completeVideo = await decodeFreshProtectedVideo(output, { cwd: root, env, expectedOutputBytes: bytes,
          onProgress: update => console.log(JSON.stringify(update)) });
      } catch (error) {
        validation.completeVideo = error.mkvFullDecodeEvidence ?? { status: "incomplete-independent-video-decode", errorName: error.name };
        validation.fullVideoDecode = false; throw error;
      }
      validation.fullVideoDecode = true; validation.fullVideoDecodeInheritedThroughWholeOutputIdentity = false;
    }
    validation.candidateGate = { passed: true }; return;
  }
  if (startupProtected || protectedRepeats || protectedFullDecode) {
    assert.equal(bytes, baseline.protectedReference.outputBytes);
    assert.equal(validation.outputSha256, baseline.protectedReference.outputSha256, "Protected repeat differs from independently validated full output");
    assert.ok(validation.structure.durationDeltaSeconds < 0.05);
    validation.independentValidation = { ...baseline.protectedReference, method: startupProtected
      ? "full disk-output SHA-256 equality to independently packet/PCM/full-video-decoded bytes, same source and deliberately different authenticated engine"
      : "full disk-output SHA-256 equality, same source and byte-exact rebuilt native engine" };
    if (startupProtected) validation.fullVideoDecodeInheritedThroughWholeOutputIdentity = true;
    if (protectedFullDecode) {
      try {
        validation.completeVideo = await decodeCompleteProtectedVideo(output, { cwd: root, env,
          onProgress: update => console.log(JSON.stringify(update)) });
      } catch (error) {
        validation.completeVideo = error.mkvFullDecodeEvidence ?? { status: "incomplete-independent-video-decode", errorName: error.name };
        validation.fullVideoDecode = false;
        throw error;
      }
      validation.fullVideoDecode = true;
    } else validation.fullVideoDecode = false;
    validation.candidateGate = { passed: true };
    return;
  }
  validation.video = await compareMkvVideoPackets(probeMkvVideoPackets(fixture, 0, { cwd: root, env }),
    probeMkvVideoPackets(output, 0, { cwd: root, env }), { sourceIndex: 0, outputIndex: 0 });
  assert.equal(validation.video.packets, mkvProtectedCopy.videoPackets);
  validation.aac = await compareMkvSustainedAac(probeMkvSustainedAac(fixture, { cwd: root, env }), probeMkvSustainedAac(output, { cwd: root, env }));
  assert.equal(validation.aac.initialSkipSamples, mkvProtectedCopy.primingSamples);
  validation.aac.sourcePcm = await decodedPcm(fixture, env);
  validation.aac.outputPcm = await decodedPcm(output, env);
  assert.equal(validation.aac.outputPcm, validation.aac.sourcePcm, "Protected HE-AAC decoded PCM differs");
  validation.decodedVideoSpans = [];
  for (const seconds of [0, 6170, 12337]) {
    const { stdout } = await runNative(ffmpeg, ["-v", "error", "-xerror", "-ss", String(seconds), "-threads", "1", "-i", output,
      "-t", "2", "-map", "0:v:0", "-f", "framehash", "-hash", "sha256", "-"], env);
    const frames = stdout.split(/\r?\n/).filter(line => /^\s*0\s*,/.test(line)).length;
    assert.equal(frames, 48, "Independent 2-second decode window must contain all 48 frames");
    validation.decodedVideoSpans.push({ seconds, frames });
  }
  assert.ok(validation.structure.durationDeltaSeconds < 0.05, "Protected duration differs by at least 50 ms");
  validation.fullVideoDecode = false;
  validation.candidateGate = { passed: true };
}

async function validateSustainedOutput(fixture, output, bytes, baseline, env, row) {
  const validation = row.validation = { outputSha256: await hashFile(output) };
  if (baseline.reference) {
    assert.equal(validation.outputSha256, baseline.reference.outputSha256, "Destination or repeat changed a fully validated MP4");
    assert.equal(bytes, baseline.reference.outputBytes);
    validation.independentValidation = "full SHA-256 identity to the independently decoded and packet-validated output";
    validation.candidateGate = { passed: true };
    return;
  }
  const inspected = await probe(output, env), streams = inspected.streams;
  assert.deepEqual(streams.map(s => s.codec_name), ["hevc", "aac"]);
  for (const [index, fields] of [[0, ["width", "height", "r_frame_rate", "pix_fmt"]], [1, ["sample_rate", "channels", "profile"]]]) {
    for (const field of fields) assert.equal(streams[index][field], baseline.probe.streams[index][field]);
    assert.equal(streams[index].nb_read_packets, baseline.probe.streams[index].nb_read_packets);
  }
  assert.match(inspected.format.format_name, /mp4/);
  validation.sourceDurationSeconds = Number(baseline.probe.format.duration);
  validation.outputDurationSeconds = Number(inspected.format.duration);
  validation.durationDeltaSeconds = Math.abs(validation.outputDurationSeconds - validation.sourceDurationSeconds);
  validation.serializedTimeline = await readMkvMp4TimelineBoxes(output, { sustained: true });
  assert.deepEqual(validation.serializedTimeline.tracks.map(t => [t.kind, t.editListPresent]), [["vide", true], ["soun", true]]);
  validation.video = await compareMkvVideoPackets(probeMkvVideoPackets(fixture, 0, { cwd: root, env }),
    probeMkvVideoPackets(output, 0, { cwd: root, env }), { sourceIndex: 0, outputIndex: 0 });
  validation.aac = await compareMkvSustainedAac(probeMkvSustainedAac(fixture, { cwd: root, env }), probeMkvSustainedAac(output, { cwd: root, env }));
  assert.equal(validation.video.packets, Number(streams[0].nb_read_packets));
  assert.equal(validation.aac.packets, Number(streams[1].nb_read_packets));
  assert.equal(validation.aac.initialSkipSamples, 1024);
  assert.equal(validation.serializedTimeline.tracks[1].edits[0].mediaTimeTicks, "1024");
  validation.aac.sourcePcm = baseline.sourcePcm;
  validation.aac.outputPcm = await decodedPcm(output, env);
  assert.equal(validation.aac.outputPcm, validation.aac.sourcePcm);
  await runNative(ffmpeg, ["-v", "error", "-xerror", "-threads", "1", "-i", output,
    "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"], env, 180000);
  validation.fullDecode = true;
  assert.ok(validation.durationDeltaSeconds < 0.05, "Container duration differs by at least 50 ms");
  validation.candidateGate = { passed: true };
}

async function validateLoopSourceOutput(fixture, output, baseline, env, row) {
  const v = row.validation = { outputSha256: await hashFile(output), outputProbe: await probe(output, env),
    sourcePacketHashes: baseline.packetHashes, outputPacketHashes: await packets(output, env) };
  assert.equal(v.outputPacketHashes, v.sourcePacketHashes, "Complete encoded streams changed");
  v.completeEncodedStreamHashesEqual = true;
  assert.deepEqual(v.outputProbe.streams.map(s => s.codec_name), ["hevc", "aac"]);
  for (const [index, fields] of [[0, ["profile", "width", "height", "pix_fmt", "sample_aspect_ratio", "color_space", "color_range", "color_primaries", "color_transfer", "extradata_size"]],
    [1, ["profile", "sample_rate", "channels", "channel_layout", "extradata_size"]]])
    for (const field of fields) assert.equal(v.outputProbe.streams[index][field], baseline.probe.streams[index][field], `Stream ${index} ${field} changed`);
  v.serializedTimeline = await readMkvMp4TimelineBoxes(output, { scalingPrefix: true });
  if (hevcKnownDts) {
    assert.deepEqual(v.serializedTimeline.tracks.map(t => t.kind), ["vide", "soun"]);
    assert.ok(v.serializedTimeline.tracks.every(t => t.editListPresent && t.firstFragmentDecodeTimeTicks === "0" && t.durationTicks === "0"));
    assert.equal(v.serializedTimeline.movie.durationTicks, "0");
    const audioTrack = v.serializedTimeline.tracks[1]; assert.equal(audioTrack.timeScale, 48000);
    assert.deepEqual(audioTrack.edits, [{ segmentDurationTicks: "0", mediaTimeTicks: "1024", mediaRateInteger: 1, mediaRateFraction: 0 }]);
  }
  v.video = await (hevcKnownDts ? compareMkvGapAwareVideoPackets : compareMkvVideoPackets)(probeMkvVideoPackets(fixture, 0, { cwd: root, env }),
    probeMkvVideoPackets(output, 0, { cwd: root, env }), { sourceIndex: 0, outputIndex: 0, sourceReorderDepth: baseline.probe.streams[0].has_b_frames });
  assert.equal(v.video.packets, 576);
  v.aac = await compareMkvSustainedAac(probeMkvSustainedAac(fixture, { cwd: root, env }), probeMkvSustainedAac(output, { cwd: root, env }));
  assert.equal(v.aac.initialSkipSamples, 1024);
  v.sourcePcm = await decodedPcm(fixture, env); v.outputPcm = await decodedPcm(output, env);
  assert.equal(v.outputPcm, v.sourcePcm);
  if (hevcKnownDts) {
    const decode = async file => (await runNative(ffmpeg, ["-v", "error", "-xerror", "-threads", "1", "-noautorotate", "-i", file,
      "-map", "0:v:0", "-map", "0:a:0", "-c:v", "rawvideo", "-pix_fmt", "yuv420p", "-fps_mode", "passthrough",
      "-c:a", "pcm_s16le", "-f", "streamhash", "-hash", "sha256", "-"], env)).stdout.trim();
    v.sourceDecodedHashes = baseline.decodedHashes ??= await decode(fixture);
    v.outputDecodedHashes = await decode(output);
    assert.match(v.sourceDecodedHashes, /^0,v,SHA256=[a-f0-9]{64}\r?\n1,a,SHA256=[a-f0-9]{64}$/);
    assert.equal(v.outputDecodedHashes, v.sourceDecodedHashes, "Complete decoded video or PCM changed");
    v.completeDecodedVideoAndPcmEqual = true;
  }
  await runNative(ffmpeg, ["-v", "error", "-xerror", "-threads", "1", "-i", output, "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"], env);
  v.fullDecode = true; v.candidateGate = { passed: true };
}
const assets = new Set();
for (const dir of ["assets", "engines"]) for (const name of await readdir(path.join(root, "dist/client", dir), { recursive: true }))
  if (!name.includes("..")) assets.add(`/${dir}/${name.replaceAll("\\", "/")}`);
for (const name of await readdir(path.join(root, "dist/client"))) assets.add("/" + name);
const stable = async (get, rows) => {
  const selected = [], deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    await get(); const last = rows.at(-1);
    if (last && last.sequence !== selected.at(-1)?.sequence) selected.push({ ...last, elapsedMs: Date.parse(last.timestamp) });
    const value = stableWindow(selected); if (value) return value;
    await pause(750);
  }
  throw new Error("Normal-service blank/idle/cleanup stable memory is unavailable");
};
const port = async () => {
  const socket = createServer();
  return new Promise((resolve, reject) => {
    socket.once("error", reject); socket.listen(0, "127.0.0.1", () => { const selected = socket.address().port;
      socket.close(error => error ? reject(error) : resolve(selected)); });
  });
};

async function arm(mode, fixture, fixtureRuntime, baseline, protectedJobs = 1) {
  const candidate = Boolean(baseline.candidate), staged = mode === "staged" || mode === "edit-list";
  const result = { mode, status: "running", requests: 0, workerResponses: 0, directEngineRequests: { module: 0, wasm: 0 }, forbiddenRequests: [], cases: [], failures: [] };
  if (protectedRepeats) result.plannedProtectedJobs = protectedJobs;
  if (candidate) result.engineResponses = { module: 0, wasm: 0 };
  report.arms.push(result);
  const runtime = await createOwnedRuntimeScratch("mkv-direct-reuse-");
  const env = { ...runtime.env, WRANGLER_SEND_METRICS: "false", NEXT_TELEMETRY_DISABLED: "1" };
  const samples = []; let server, chrome, identity, monitor, browser, page, timer, pending, activeAt, until, rejectStop, errorSeen, retention;
  let protectedStarted, protectedTerminal;
  const protectedWindows = [];
  const duringConversion = time => !protectedMode || protectedWindows.some(w => time >= w.start && (w.end === undefined || time <= w.end));
  let startupCancellation;
  const stop = new Promise((_, reject) => { rejectStop = reject; }); void stop.catch(() => {});
  const fail = error => { errorSeen ??= error; rejectStop(error); };
  const guard = work => Promise.race([stop, work]);
  const drain = () => pending ??= (async () => {
    if (!monitor) return;
    const batch = await monitor.drain(); assert.equal(batch.overflow, false);
    assert.ok(samples.length + batch.samples.length <= (protectedFullDecode || headerProtected ? 20000 : protectedMode ? 9000 : 3000), "Finite native journal"); samples.push(...batch.samples);
    if (activeAt !== undefined) for (const row of batch.samples) {
      if (Date.parse(row.timestamp) >= activeAt && (until === undefined || Date.parse(row.timestamp) <= until) && duringConversion(Date.parse(row.timestamp)) && row.privateBytes !== null &&
          (row.privateBytes - result.blank.privateBytes) / 1048576 > report.peakLimitMiB) fail(new Error("Unchanged 250 MiB whole-Chromium gate exceeded"));
    }
  })().finally(() => { pending = null; });
  try {
    result.host = await inspectStressHostMemory(); assert.equal(result.host.safeToStart, true);
    const overlay = staged ? null : await buildMkvDirectReuseOverlay({ root, directory: runtime.directory, mode });
    if (overlay) result.overlay = overlay.proof;
    else {
      const names = [...assets].filter(name => /^\/assets\/conversion\.worker-[\w-]+\.js$/.test(name)); assert.equal(names.length, 1);
      const workerSha256 = await hashFile(path.join(root, "dist/client", names[0].slice(1)));
      assert.equal(workerSha256, baseline.retained.arms[0].overlay.releaseWorkerSha256);
      result.releaseWorker = { asset: names[0], sha256: workerSha256, overrides: false, requests: 0 };
    }
    result.browser = await inspectInstalledChromePin(); assertInstalledChromePinsEqual(result.browser, baseline.browser);
    server = await startOwnedProductionTestServer({ root, directory: runtime.directory, env, port: await port() });
    result.serverLaunch = server.launchRecord;
    const profile = path.join(runtime.directory, "profile");
    result.launch = ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "about:blank"];
    chrome = spawn(result.browser.launcher.path, result.launch, { cwd: root, env, windowsHide: true, stdio: "ignore" });
    chrome.on("error", fail);
    identity = await queryReliableProcessIdentity(chrome.pid); assert.ok(identity); result.identity = identity;
    monitor = await startClassifiedChromiumMemoryMonitor(chrome.pid, runtime.directory, 100);
    let debugPort;
    for (let attempt = 0; attempt < 45 && !debugPort; attempt++) {
      try { debugPort = /^(\d+)\r?\n/.exec(await readFile(path.join(profile, "DevToolsActivePort"), "utf8"))?.[1]; }
      catch (error) { if (error.code !== "ENOENT") throw error; }
      if (!debugPort) await pause(250);
    }
    assert.ok(debugPort); browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
    const context = browser.contexts()[0]; page = context.pages()[0]; await page.goto("about:blank");
    result.blank = await stable(drain, samples);
    await context.addInitScript(`window.__WITHIN_AUDIO_VALIDATION_CHUNK__=(${encodeBoundedValidationChunk.toString()});`);
    await context.route("**/*", async route => {
      const request = route.request(), method = request.method(), url = request.url();
      let frameUrl = null; try { frameUrl = request.frame()?.url() ?? null; } catch { /* worker-owned */ }
      const kind = classifyPrivateRequest({ method, url, frameUrl, serviceWorkerUrl: request.serviceWorker?.()?.url() ?? null,
        postData: ["GET", "HEAD"].includes(method) ? request.postData() : "blocked-non-read" }, server.baseURL);
      const faultUrl = server.baseURL + "/?test=1&directory=1&fault=write";
      if (++result.requests > 256 || !(kind === "browser-local" || kind === "app-static" &&
          (url === faultUrl || isCompatibilityStaticPath(url, server.baseURL, assets)))) {
        if (result.forbiddenRequests.length < 16) result.forbiddenRequests.push({ method, kind, urlSha256: sha(url) });
        fail(new Error("Request outside exact built-asset/privacy policy")); await route.abort();
      } else if (candidate && kind === "app-static" && baseline.candidate.assets.has(new URL(url).pathname)) {
        try {
          const pathname = new URL(url).pathname, tool = baseline.candidate.assets.get(pathname);
          const role = pathname.endsWith(".wasm") ? "wasm" : "module";
          assert.equal(method, "GET"); assert.equal(url, server.baseURL + pathname);
          assert.ok(++result.directEngineRequests[role] <= 16);
          const response = await route.fetch({ maxRedirects: 0 });
          try {
            assert.equal(response.status(), 200);
            const headers = response.headers();
            assert.equal(headers["cross-origin-resource-policy"], "same-origin");
            assert.equal(headers["cross-origin-embedder-policy"], "require-corp");
            for (const header of ["content-encoding", "content-length", "etag", "last-modified"]) delete headers[header];
            headers["cache-control"] = "no-store";
            if (role === "wasm" && startupCancellation) {
              const gate = startupCancellation;
              assert.equal(gate.hits++, 0, "Cancel control holds exactly one authenticated Wasm response");
              gate.arrive();
              await gate.resume;
            }
            await route.fulfill({ response, headers, body: tool.body, contentType: tool.type });
            result.engineResponses[role]++;
          } finally { await response.dispose(); }
        } catch (error) { fail(error); await route.abort().catch(() => {}); }
      } else if (overlay && url === server.baseURL + overlay.requestedAsset) {
        try {
          assert.equal(method, "GET"); assert.ok(result.workerResponses < 16);
          const response = await route.fetch({ maxRedirects: 0 });
          try {
            assert.equal(response.status(), 200); const headers = response.headers();
            assert.equal(headers["cross-origin-embedder-policy"], "require-corp");
            assert.equal(headers["cross-origin-resource-policy"], "same-origin");
            assert.equal(headers["cross-origin-opener-policy"], "same-origin");
            assert.match(headers["content-security-policy"], /wasm-unsafe-eval/);
            delete headers["content-encoding"]; delete headers["content-length"]; delete headers.etag;
            headers["cache-control"] = "no-store";
            await route.fulfill({ response, headers, path: overlay.file, contentType: "text/javascript" }); result.workerResponses++;
          } finally { await response.dispose(); }
        } catch (error) { fail(error); await route.abort().catch(() => {}); }
      } else {
        if (result.releaseWorker && url === server.baseURL + result.releaseWorker.asset) result.releaseWorker.requests++;
        if (url === server.baseURL + "/engines/remux/within-direct.mjs") result.directEngineRequests.module++;
        if (url === server.baseURL + "/engines/remux/within-direct.wasm") result.directEngineRequests.wasm++;
        await route.continue();
      }
    });
    const open = async (fault = false) => {
      await guard(page.goto(server.baseURL + "/?test=1&directory=1" + (fault ? "&fault=write" : "")));
      await guard(page.waitForFunction(() => window.__WITHIN_TEST__?.getState().workerStatus === "ready", undefined, { timeout: 20000 }));
      assert.ok(await page.evaluate(() => crossOriginIsolated));
    };
    const entries = () => page.evaluate(async protectedMode => {
      const directory = await navigator.storage.getDirectory(), found = [];
      for await (const [name, handle] of directory.entries()) {
        if (name.startsWith("within-") || (protectedMode && name === "test.mp4")) { if (found.length >= 16 || handle.kind !== "file") throw new Error("Unexpected OPFS entries");
          found.push({ name, bytes: (await handle.getFile()).size }); }
      }
      return found;
    }, protectedMode);
    const remove = name => page.evaluate(async name => (await navigator.storage.getDirectory()).removeEntry(name), name);
    await open(); result.loaded = await stable(drain, samples);
    if (headerProtectedRetention) {
      const debugPath = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8")).trim().split(/\r?\n/)[1];
      assert.match(debugPath, /^\/devtools\/browser\/[a-f0-9-]+$/);
      retention = await createMkvRetentionDiagnostic({ root, reportBase: path.join(root, "outputs/reports", `${stamp}-mkv-retention`),
        socketUrl: `ws://127.0.0.1:${debugPort}${debugPath}`, origin: server.baseURL, browser, page,
        getProcesses: async () => { await drain(); const row = samples.findLast(s => s.privateBytes !== null && Array.isArray(s.processes)); assert.ok(row); return row.processes; } });
      assert.equal((await retention.capture("loaded-before-media", true)).error, null);
    }
    activeAt = Date.now();
    timer = setInterval(() => void drain().catch(fail), 500);
    async function job(fault = false, cancel = false) {
      const row = { fault, selection: await guard(protectedMode ? selectExactLocalOriginal(page, fixture) : selectOwnedLocalBrowserFile(page, fixture, fixtureRuntime.directory)) };
      if (protectedMode) report.originalMediaSelected = row.selection.completeOriginalSelected;
      if (cancel) row.cancel = sustained ? "after-positive-destination-writes" : "during-authenticated-wasm-load-before-native-packets";
      result.cases.push(row);
      if (retention) assert.equal((await retention.capture(`job-${result.cases.length}-before`)).error, null);
      await guard(page.locator('[data-testid="format-select"]').selectOption(profileId));
      if (cancel && sustained) {
        await guard(page.locator('[data-testid="convert-button"]').click());
        const observed = await guard(page.waitForFunction(({ staged, completeBytes }) => {
          const state = window.__WITHIN_TEST__?.getState(), outputBytes = state?.metrics?.outputBytes ?? 0;
          if (state?.jobState !== "running" || outputBytes < 2 * 1048576 || outputBytes >= completeBytes ||
              (staged && state.phase !== "Copying staged MP4 to selected destination")) return false;
          const button = [...document.querySelectorAll("button")].find(b => b.textContent.trim() === "Cancel safely" && !b.disabled);
          if (!button) return false;
          button.click();
          return { outputBytes, phase: state.phase };
        }, { staged, completeBytes: baseline.reference.outputBytes }, { timeout: 20000 }));
        row.cancellationBefore = await observed.jsonValue(); await observed.dispose();
        assert.ok(row.cancellationBefore.outputBytes >= 2 * mib && row.cancellationBefore.outputBytes < baseline.reference.outputBytes);
      } else if (cancel) {
        assert.ok(exactAacCandidate && candidate && !fault && !startupCancellation);
        const arrival = Promise.withResolvers(), resume = Promise.withResolvers();
        startupCancellation = { hits: 0, arrive: arrival.resolve, resume: resume.promise, release: resume.resolve };
        const timeout = new AbortController();
        try {
          await guard(page.locator('[data-testid="convert-button"]').click());
          await guard(Promise.race([arrival.promise, pause(12000, null, { signal: timeout.signal }).then(() => { throw new Error("Candidate Wasm request not observed during cancellation control"); })]));
          const state = await page.evaluate(() => window.__WITHIN_TEST__.getState());
          assert.equal(state.jobState, "running");
          assert.equal(state.metrics?.outputBytes ?? 0, 0);
          row.cancellationBefore = { jobState: state.jobState, outputBytes: 0, wasmResponseHeld: true };
          await guard(page.getByRole("button", { name: "Cancel safely", exact: true }).click({ timeout: 10000 }));
        } finally {
          timeout.abort(); resume.resolve(); startupCancellation = null;
        }
      } else {
        if (protectedMode) {
          protectedStarted = Date.now(); protectedTerminal = undefined;
          row.conversionWindow = { start: protectedStarted };
          protectedWindows.push(row.conversionWindow);
        }
        await guard(page.locator('[data-testid="convert-button"]').click());
      }
      await guard(page.waitForFunction(() => ["complete", "error", "cancelled"].includes(window.__WITHIN_TEST__?.getState().jobState), undefined, { timeout: protectedMode ? 180000 : 45000 }));
      if (protectedMode) { protectedTerminal = Date.now(); row.conversionWindow.end = protectedTerminal; }
      const state = await page.evaluate(() => window.__WITHIN_TEST__.getState()); row.state = state.jobState; row.metrics = state.metrics;
      if (retention) assert.equal((await retention.capture(`job-${result.cases.length}-terminal`)).error, null);
      row.error = typeof state.error === "string" ? state.error.slice(0, 2048) : null;
      row.phase = typeof state.phase === "string" ? state.phase.slice(0, 256) : null;
      if (terminalDiagnostic) {
        assert.equal(row.state, "error"); assert.ok(row.error); assert.equal(row.metrics.outputBytes, 0);
        row.diagnosticTerminalCaptured = true;
        throw new Error(`Diagnostic-only engine refusal, not acceptance: ${row.error}`);
      }
      const leftovers = await entries(); assert.ok(leftovers.every(item => !item.name.startsWith("within-stage-")));
      if (fault || cancel) {
        if (fault) { assert.equal(row.state, "error"); assert.match(state.error, /destination rejected a bounded write/); }
        else {
          assert.equal(row.state, "cancelled"); assert.equal(state.opfsName, null);
          assert.equal(row.metrics?.queuedBytes ?? 0, 0); assert.equal(row.metrics?.pendingOperations ?? 0, 0);
        }
        assert.ok(leftovers.every(item => item.name.startsWith("within-test-") && item.bytes === 0));
        row.onlyEmptyPlaceholders = true;
        for (const item of leftovers) await remove(item.name);
      } else {
        assert.equal(row.state, "complete"); assert.equal(state.opfsName, null);
        assert.deepEqual(state.batchOutputNames, [protectedMode ? "test.mp4" : `${syntheticName}.mp4`]); const name = state.batchOutputNames[0];
        if (protectedMode) assert.ok(row.metrics.outputBytes >= mkvProtectedCopy.minOutputBytes && row.metrics.outputBytes <= mkvProtectedCopy.maxOutputBytes);
        else if (sustained) assert.ok(row.metrics.outputBytes >= minSustainedBytes && row.metrics.outputBytes <= maxSustainedBytes);
        else assert.ok(row.metrics.outputBytes > (complexTimeline ? 400000 : 2 * mib) && row.metrics.outputBytes <= (scalingLoopControl ? 16 : 8) * mib);
        const bind = scalingLoopControl ? bindScalingMkvOutputValidationBacking : protectedMode ? bindProtectedMkvOutputValidationBacking : sustained ? bindLargeAudioOutputValidationBacking : bindOpfsOutputValidationBacking;
        const binding = await bind(page, profile, name, row.metrics.outputBytes); row.binding = binding.proof;
        if (scalingLoopControl) {
          await validateLoopSourceOutput(fixture, binding.file, baseline, env, row);
          await assertOpfsOutputValidationBackingUnchanged(binding); await remove(name);
          assert.equal(row.metrics.peakScratchBytes ?? 0, 0);
        } else if (protectedMode) {
          await validateProtectedOutput(fixture, binding.file, row.metrics.outputBytes, baseline, state.warnings, env, row);
          await assertOpfsOutputValidationBackingUnchanged(binding); await remove(name);
          assert.equal(row.metrics.peakScratchBytes ?? 0, 0);
        } else if (complexTimeline) {
          const validation = row.validation = { outputSha256: await hashFile(binding.file) };
          if (startupSimpleControl) {
            assert.equal(validation.outputSha256, baseline.complexReference.outputSha256);
            assert.equal(row.metrics.outputBytes, baseline.complexReference.outputBytes);
            validation.sameInputPriorOutput = baseline.complexReference;
          }
          validation.outputProbe = await probeProtected(binding.file, env);
          validation.warnings = state.warnings;
          validation.structure = (startupCandidate ? assertComplexMkvMetadata : assertComplexMkvStructure)(baseline.probe, validation.outputProbe, state.warnings);
          const outputComplexPackets = await complexPackets(binding.file, env);
          validation.packets = compareComplexMkvPackets(baseline.complexPackets, outputComplexPackets);
          if (startupCandidate) {
            assert.equal(validation.packets.clocks[0].comparableDts, 70);
            assert.equal(validation.packets.clocks[0].sourceFirstDtsUs, null);
            const offset = positiveStartCandidate ? 5000000 : 0, initialDts = [-167000 + offset, -84000 + offset];
            assert.equal(validation.packets.clocks[0].outputFirstDtsUs, initialDts[0]);
            assert.deepEqual(outputComplexPackets.filter(p => p.stream_index === 0).slice(0, 2).map(p => Math.round(Number(p.dts_time) * 1e6)), initialDts);
            const disclosure = assertStartupDtsDisclosure(state.warnings, hevcHeaderParser);
            validation.startupDts = { generatedOnlyForUnavailablePrefix: true, sourceMissing: 2, knownSourceDtsCompared: 70,
              expectedInitialDtsUs: initialDts, nominalFrameRateUsed: false, disclosure };
          }
          validation.sourceDecodedHashes = baseline.complexDecodedHashes;
          validation.outputDecodedHashes = await complexDecodedHashes(binding.file, env);
          assert.equal(validation.outputDecodedHashes, validation.sourceDecodedHashes, "Complete decoded VFR video or either AAC track changed");
          validation.fullDecode = true;
          validation.serializedTimeline = await readMkvMp4TimelineBoxes(binding.file);
          assert.deepEqual(validation.serializedTimeline.tracks.map(t => t.kind), ["vide", "soun", "soun"]);
          assert.ok(validation.serializedTimeline.tracks.every(t => t.editListPresent));
          for (const track of validation.serializedTimeline.tracks.slice(1)) {
            if (positiveStartCandidate) {
              assert.equal(track.edits.length, 2); assert.equal(track.edits[0].mediaTimeTicks, "-1");
              assert.equal(Number(track.edits[0].segmentDurationTicks) / validation.serializedTimeline.movie.timeScale, 5);
              assert.equal(track.edits[1].mediaTimeTicks, "1024");
              assert.ok(track.edits.every(e => e.mediaRateInteger === 1 && e.mediaRateFraction === 0));
            } else assert.equal(track.edits[0].mediaTimeTicks, "1024");
          }
          if (startupHeaderDiagnostic) {
            const clocks = packets => [0, 1, 2].map(index => {
              const track = packets.filter(p => p.stream_index === index);
              return { index, first: track.slice(0, 5), last: track.slice(-5),
                minimumPts: Math.min(...track.map(p => Number(p.pts_time))), maximumPts: Math.max(...track.map(p => Number(p.pts_time))),
                minimumKnownDts: Math.min(...track.filter(p => p.dts_time !== undefined).map(p => Number(p.dts_time))),
                maximumKnownDts: Math.max(...track.filter(p => p.dts_time !== undefined).map(p => Number(p.dts_time))) };
            });
            validation.headerDiagnostic = { source: clocks(baseline.complexPackets), output: clocks(outputComplexPackets),
              rawDurationDeltaSeconds: Math.abs(Number(baseline.probe.format.duration) - Number(validation.outputProbe.format.duration)),
              originalHeaderToleranceSeconds: 0.05, allPriorIndependentChecksPassed: true };
            // Deliberately retain the same failure, not a diagnostic "pass".
            assertComplexMkvStructure(baseline.probe, validation.outputProbe, state.warnings);
            throw new Error("Diagnostic-only output, not acceptance");
          }
          if (startupCandidate) validation.presentationTimeline = validateComplexFragmentedTimeline({
            sourceProbe: baseline.probe, outputProbe: validation.outputProbe,
            sourcePackets: baseline.complexPackets, outputPackets: outputComplexPackets,
            sourceDecodedHashes: baseline.complexDecodedHashes, outputDecodedHashes: validation.outputDecodedHashes,
            serializedTimeline: validation.serializedTimeline, requirePositiveStart: positiveStartCandidate });
          validation.candidateGate = { passed: true };
          await assertOpfsOutputValidationBackingUnchanged(binding); await remove(name);
          assert.equal(row.metrics.peakScratchBytes ?? 0, 0);
        } else if (sustained) {
          await validateSustainedOutput(fixture, binding.file, row.metrics.outputBytes, baseline, env, row);
          await assertOpfsOutputValidationBackingUnchanged(binding); await remove(name);
          assert.equal(row.metrics.peakScratchBytes ?? 0, staged ? row.metrics.outputBytes : 0);
        } else {
        const output = await probe(binding.file, env), inStreams = baseline.probe.streams, outStreams = output.streams;
        row.validation = { outputSha256: await hashFile(binding.file), packetHashes: await packets(binding.file, env),
          clocks: compareSmallMkvPacketClocks(baseline.clocks, await packetClocks(binding.file, env)),
          streams: outStreams.map(s => ({ codec: s.codec_name, packetCount: Number(s.nb_read_packets), nominalFrameRate: s.r_frame_rate, averageFrameRate: s.avg_frame_rate })),
          sourceVideoAverageRate: inStreams[0].avg_frame_rate, durationDeltaSeconds: Math.abs(Number(output.format.duration) - Number(baseline.probe.format.duration)),
          sourceHeader: { startSeconds: Number(baseline.probe.format.start_time), durationSeconds: Number(baseline.probe.format.duration) },
          outputHeader: { startSeconds: Number(output.format.start_time), durationSeconds: Number(output.format.duration) } };
        if (staged || candidate) row.validation.serializedTimeline = await readMkvMp4TimelineBoxes(binding.file);
        if (candidate) {
          const outputPcm = await decodedPcm(binding.file, env), outputPackets = await aacPackets(binding.file, env);
          row.validation.aac = { sourcePcm: baseline.aac.pcm, outputPcm, completeDecodedPcmEqual: baseline.aac.pcm === outputPcm,
            outputPacketCount: outputPackets.length, outputEdges: [outputPackets[0], outputPackets.at(-1)] };
          try {
            row.validation.aac.packetTimingAndTrim = validateCopiedAudioTiming(baseline.aac.packets, outputPackets, [1], [1])[0];
          } catch (error) { row.validation.aac.packetTimingOrTrimFailure = String(error.message).slice(0, 512); }
        }
        await runNative(ffmpeg, ["-v", "error", "-xerror", "-threads", "1", "-i", binding.file,
          "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"], env);
        row.validation.fullDecode = true;
        await assertOpfsOutputValidationBackingUnchanged(binding); await remove(name);
        assert.deepEqual(outStreams.map(s => s.codec_name), ["hevc", "aac"]);
        for (const [index, fields] of [[0, ["width", "height", "r_frame_rate", "pix_fmt"]], [1, ["sample_rate", "channels"]]]) {
          for (const field of fields) assert.equal(outStreams[index][field], inStreams[index][field]);
          assert.equal(outStreams[index].nb_read_packets, inStreams[index].nb_read_packets);
        }
        assert.equal(outStreams[0].r_frame_rate, "24/1");
        assert.match(output.format.format_name, /mp4/);
        assert.equal(row.validation.packetHashes, baseline.packetHashes);
        if (probeHevcControl) {
          assert.equal(row.validation.outputSha256, baseline.hevcReference.outputSha256, "Changed core altered previously validated HEVC output bytes");
          assert.equal(row.metrics.outputBytes, baseline.hevcReference.outputBytes);
          row.validation.hevcReference = baseline.hevcReference;
        }
        const durationPassed = row.validation.durationDeltaSeconds < 0.05;
        const packetClocksPassed = row.validation.clocks.every(track => track.maximumPtsErrorUs <= 1000 && track.outputDtsMonotonic);
        row.validation.timingGate = { durationPassed, packetClocksPassed, passed: durationPassed && packetClocksPassed,
          maxDurationDeltaSecondsExclusive: 0.05, maxPacketPtsDeltaUs: 1000 };
        if (!staged) {
          assert.ok(durationPassed, "Container duration differs by at least 50 ms");
          assert.ok(packetClocksPassed, "Packet clock exceeds one source tick or output DTS is not monotonic");
        } else {
          row.validation.byteIdenticalToRetainedDirect = baseline.retained.arms.every(a => a.cases[0].validation.outputSha256 === row.validation.outputSha256);
          assert.equal(row.metrics.peakScratchBytes, row.metrics.outputBytes, "The staged path must actually stage the full small output");
        }
        if (candidate) row.validation.candidateGate = { passed: row.validation.timingGate.passed &&
          row.validation.aac.completeDecodedPcmEqual && Boolean(row.validation.aac.packetTimingAndTrim) &&
          row.validation.serializedTimeline.tracks.every(track => track.editListPresent) };
        if (compareDestinations) {
          assert.equal(row.validation.outputSha256, baseline.reference.outputSha256, "Destination must not change MP4 bytes");
          assert.equal(row.metrics.outputBytes, baseline.reference.outputBytes);
          assert.equal(row.metrics.peakScratchBytes ?? 0, staged ? row.metrics.outputBytes : 0);
        }
        }
        assert.equal(row.metrics.activeWorkerCount, 1);
        // The native bridge counts both its shared Wasm backing and the 4-byte
        // cancellation flag. Neither the direct writer nor the reuse buffer adds SAB.
        assert.ok(row.metrics.peakWasmMemoryBytes >= 24 * 1048576 && row.metrics.peakWasmMemoryBytes <= 64 * 1048576);
        assert.equal(row.metrics.sharedArrayBufferBytes, row.metrics.peakWasmMemoryBytes + 4);
        assert.equal(row.metrics.scratchBytes ?? 0, 0); assert.ok(row.metrics.maxReadChunkBytes <= 262144);
        assert.ok(row.metrics.maxWriteChunkBytes <= 1048576 && row.metrics.peakQueuedBytes <= 1048576);
        assert.equal(row.metrics.peakPendingOperations, 1); assert.equal(row.metrics.pendingOperations, 0);
      }
      assert.deepEqual(await entries(), []); row.outputRemoved = true;
      if (protectedRepeats) {
        await drain();
        row.memory = summarizeProtectedWindow(samples, row.conversionWindow, result.blank.privateBytes);
        row.cleanupStable = await guard(stable(drain, samples));
        row.cleanupAboveIdleMiB = (row.cleanupStable.privateBytes - result.loaded.privateBytes) / mib;
        assert.ok(row.cleanupAboveIdleMiB <= 96, "Protected repeat cleanup exceeded unchanged 96 MiB gate");
        if (retention) assert.equal((await retention.capture(`job-${result.cases.length}-cleanup`, [1, 3, 6].includes(result.cases.length))).error, null);
      }
      if (sustained && !fault && !cancel && !baseline.reference) baseline.reference = { outputSha256: row.validation.outputSha256, outputBytes: row.metrics.outputBytes };
    }
    await job();
    if (protectedRepeats) {
      for (let index = 1; index < protectedJobs; index++) await job();
    } else if (sustained) {
      await open(); await job(false, true);
      await open(true); await job(true);
      await open(); await job();
      await open(); await job();
    } else if (compareDestinations) {
      if (result.cases[0].validation.candidateGate.passed) { await open(true); await job(true); await open(); await job(); }
    } else if (!protectedMode && (mode === "reuse" || (candidate && result.cases[0].validation.candidateGate.passed))) {
      if (exactAacCandidate) { await open(); await job(false, true); }
      await open(true); await job(true); await open(); await job();
    }
    result.cleanupStable = await guard(stable(drain, samples)); until = Date.now(); await drain();
    assert.equal(errorSeen, undefined); assert.deepEqual(result.forbiddenRequests, []);
    if (staged) { assert.equal(result.workerResponses, 0); assert.ok(result.releaseWorker.requests > 0); }
    else assert.ok(result.workerResponses > 0);
    assert.ok(result.directEngineRequests.module > 0 && result.directEngineRequests.wasm > 0);
    if (candidate) {
      assert.deepEqual(result.engineResponses, result.directEngineRequests);
      assert.equal(result.cases.length, protectedRepeats ? protectedJobs : protectedMode ? 1 : sustained ? 5 : exactAacCandidate && !compareDestinations ? 4 : 3, "Candidate failed initial timing/trim/PCM/edit-list gate; do not replay");
      const successes = result.cases.filter(row => !row.fault && !row.cancel);
      assert.ok(successes.every(row => row.validation.candidateGate.passed));
      if (exactAacCandidate && !protectedMode) assert.equal(successes[0].validation.outputSha256, successes[1].validation.outputSha256, "Recovery changed a deterministic output");
      result.status = scalingLoopControl ? "passed-loop-source-fidelity-control" : fixedHevcBaseline ? "passed-fixed-input-hevc-baseline" : probeHevcControl ? "passed-probe-decoder-hevc-regression" : complexTimeline ? "passed-complex-exact-aac-direct-reuse" : protectedFullDecode ? "passed-protected-complete-video-decode" : protectedRepeats ? "passed-protected-repeat-session" : protectedMode ? "passed-first-protected-exact-aac-direct-reuse" : sustained ? "passed-sustained-exact-aac-destination-arm" : compareDestinations ? "passed-small-exact-aac-destination-arm" : "passed-unpublished-small-staged-clock-control";
    } else result.status = staged ? "completed-staged-timeline-diagnostic-not-acceptance" : "passed-private-small-direct-control";
  } catch (error) {
    result.status = "failed-not-acceptance"; result.failures.push(String(error.stack ?? error).slice(0, 2048));
    if (retention && /250 MiB whole-Chromium gate exceeded/.test(String(error))) {
      // A separate bounded diagnostic checkpoint; never erase/rebase the
      // original native peak, or claim this later dump is its exact allocation.
      result.retentionFailureCheckpoint = await retention.capture("budget-failure", true).catch(reason => ({ error: String(reason).slice(0, 1024) }));
    }
  }
  finally {
    startupCancellation?.release();
    if (retention) {
      try { result.retention = await retention.close(); }
      catch (error) { result.retention = retention.report(); result.retentionCleanupError = boundedErrorDetails(error); fail(error); }
    }
    until ??= Date.now(); clearInterval(timer); await pending?.catch(fail);
    if (monitor) { await drain().catch(fail); await monitor.close().catch(fail); result.observer = monitor.ownershipSummary(); }
    if (page && !page.isClosed()) {
      if (protectedMode && result.status === "failed-not-acceptance") result.preCleanupJob = await page.evaluate(() => {
        const state = window.__WITHIN_TEST__?.getState();
        return state && { state: state.jobState, phase: state.phase, metrics: state.metrics };
      }).catch(() => null);
      try { result.jobCleanup = await cancelBrowserConversionBeforeCleanup(page); }
      catch (error) { fail(error); }
    }
    try {
      await finishOwnedCleanup([async () => {
        if (!identity) { assert.ok(!chrome || chrome.exitCode !== null, "Browser birth identity was unavailable"); return; }
        result.browserCleanup = await cleanupOwnedChromium({ identity, observedPids: [...new Set(samples.flatMap(s => (s.processes ?? []).map(p => p.pid)))],
          disconnect: async () => { await browser?.close(); } });
        if (result.browserCleanup.status !== "owned-observed-pids-absent") {
          const observedPids = result.browserCleanup.observedPids;
          result.birthCleanup = reconcileChromiumBirths({ identity, observedPids, samples, current: await queryObservedPidCensus(observedPids) });
          assert.equal(result.birthCleanup.allObservedBirthsAbsent, true);
        }
      }, async () => { if (server) result.serverCleanup = await server.close(); }]);
      await runtime.close(); result.ownedRuntimeRemoved = true;
    } catch (error) { result.cleanupFailureDetails = boundedErrorDetails(error); fail(error); }
    if (activeAt !== undefined) {
      const active = samples.filter(s => Date.parse(s.timestamp) >= activeAt && Date.parse(s.timestamp) <= until && duringConversion(Date.parse(s.timestamp)));
      const valid = active.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
      if (valid.length) {
        for (const s of valid) assert.equal(s.processes.reduce((sum, p) => sum + p.privateBytes, 0), s.privateBytes);
        const peak = valid.reduce((a, b) => a.privateBytes >= b.privateBytes ? a : b);
        result.memory = { peak, incrementalPrivateMiB: (peak.privateBytes - result.blank.privateBytes) / 1048576,
          validSamples: valid.length, unavailableSamples: active.length - valid.length, start: protectedMode ? protectedWindows[0]?.start : activeAt, end: protectedMode ? protectedTerminal ?? until : until,
          cleanupAboveIdleMiB: result.cleanupStable ? (result.cleanupStable.privateBytes - result.loaded.privateBytes) / 1048576 : null };
      }
    }
    if (result.status !== "failed-not-acceptance" && (!result.memory || result.memory.incrementalPrivateMiB > 250 ||
        result.memory.cleanupAboveIdleMiB === null || result.memory.cleanupAboveIdleMiB > 96)) fail(new Error("Unchanged native peak/cleanup gate failed"));
    if (errorSeen) { result.status = "failed-not-acceptance"; result.failures.push(String(errorSeen).slice(0, 2048)); }
    const archiveMode = protectedRepeats ? `${mode}-session${report.arms.indexOf(result) + 1}` : mode;
    const raw = Buffer.from(JSON.stringify(samples)), packed = gzipSync(raw), file = `${prefix}-${archiveMode}-native.json.gz`;
    await writeFile(path.join(root, file), packed, { flag: "wx" }); result.archive = { file, bytes: packed.length, sha256: sha(packed), decodedSha256: sha(raw) };
  }
}

let fixtureRuntime, toolRuntime;
try {
  report.originalBefore = await original(); assert.deepEqual(report.originalBefore, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
  const sourceFiles = ["scripts/qualify-mkv-direct-reuse.mjs", "scripts/lib/mkv-direct-reuse-overlay.mjs", "scripts/lib/private-mkv-write-reuse.ts", "scripts/lib/mkv-direct-packet-clocks.mjs", "scripts/lib/mkv-mp4-timeline-boxes.mjs",
    "scripts/lib/owned-production-test-server.mjs", "scripts/lib/owned-server-close.mjs", "scripts/lib/reliable-owned-identity.mjs", "scripts/lib/hidden-unit-subprocesses.mjs", "scripts/lib/bounded-error-details.mjs",
    "workers/media-remux.ts", "workers/conversion.worker.ts", "workers/random-access-destination.ts", "public/engines/remux/within-direct.mjs", "public/engines/remux/within-direct.wasm"];
  if (editListCandidate) sourceFiles.push("scripts/lib/mkv-edit-list-build-artifact.mjs", "scripts/lib/copied-audio-timing.mjs",
    "media/ffmpeg/mkv-edit-list-build-recipe.mjs", "media/ffmpeg/reproduce-nondocker.sh");
  if (exactAacCandidate) sourceFiles.push("media/ffmpeg/mkv-exact-aac-timeline-candidate.mjs", "media/ffmpeg/patches/mov-fragmented-aac-exact-priming.patch");
  if (compareDestinations) sourceFiles.push("scripts/lib/mkv-exact-aac-staged-reference.mjs", mkvStagedReference.file);
  if (sustained) sourceFiles.push(smallControl.file, "scripts/lib/mkv-streaming-video-fidelity.mjs", "scripts/lib/mkv-sustained-aac-fidelity.mjs", "scripts/lib/bounded-native-lines.mjs", "scripts/lib/opfs-output-validation-backing.mjs");
  if (protectedMode) sourceFiles.push(sustainedControl.file, "scripts/lib/mkv-protected-copy-contract.mjs", "scripts/lib/mpeg2-original-gate.mjs",
    "scripts/lib/mkv-streaming-video-fidelity.mjs", "scripts/lib/mkv-sustained-aac-fidelity.mjs", "scripts/lib/bounded-native-lines.mjs", "scripts/lib/opfs-output-validation-backing.mjs");
  if (protectedRepeats) sourceFiles.push(protectedRepeatReference.file, "scripts/lib/mkv-protected-repeat-contract.mjs");
  if (protectedFullDecode) sourceFiles.push(protectedRepeatReference.file, "scripts/lib/mkv-protected-repeat-contract.mjs", "scripts/lib/mkv-full-video-decode.mjs");
  if (complexTimeline) sourceFiles.push(selectedComplexFixture.file, "scripts/lib/mkv-complex-fidelity.mjs", "scripts/lib/mkv-protected-repeat-contract.mjs");
  if (bframeControl) sourceFiles.push(selectedComplexFixture.file + ".json", "scripts/prepare-h264-bframe-fixture.mjs");
  if (h264Vfr) sourceFiles.push("media/ffmpeg/mkv-h264-vfr-candidate.mjs");
  if (probeDecoder) sourceFiles.push("media/ffmpeg/mkv-h264-probe-decoder-candidate.mjs");
  if (startupCore) sourceFiles.push("media/ffmpeg/mkv-h264-startup-candidate.mjs", "media/ffmpeg/h264-startup-dts.h", "media/ffmpeg/h264-startup-prefix.inc");
  if (startupCandidate) sourceFiles.push("scripts/lib/mkv-complex-presentation-timeline.mjs");
  if (startupCore) sourceFiles.push("scripts/lib/mkv-startup-core-reference.mjs");
  if (scalingLoopControl) sourceFiles.push("scripts/lib/mkv-scaling-fixture.mjs", "scripts/lib/mkv-streaming-video-fidelity.mjs",
    "scripts/lib/mkv-sustained-aac-fidelity.mjs", "scripts/lib/bounded-native-lines.mjs", "scripts/lib/opfs-output-validation-backing.mjs", mkvHevcRegressionFixture.file);
  if (hevcKnownDts) sourceFiles.push("media/ffmpeg/mkv-hevc-known-dts-candidate.mjs", "scripts/lib/mkv-gap-aware-video-fidelity.mjs",
    "evidence/2026-11-15T00-31-57-030Z-mkv-startup-core-loop-source-control.json");
  if (hevcHeaderParser) sourceFiles.push("media/ffmpeg/mkv-hevc-header-parser-candidate.mjs");
  if (headerH264Regression) sourceFiles.push("scripts/lib/mkv-hevc-header-core-reference.mjs", hevcHeaderLoopReference.file);
  if (headerProtected) sourceFiles.push("scripts/lib/mkv-hevc-header-core-reference.mjs", hevcHeaderLoopReference.file,
    "scripts/lib/mkv-header-protected-reference.mjs", "scripts/lib/mkv-full-video-decode.mjs", protectedCompleteVideoReference.file,
    ...headerCoreH264References.map(ref => ref.file));
  if (headerProtectedRepeats) sourceFiles.push(headerProtectedReference.file);
  if (headerProtectedRetention) sourceFiles.push("scripts/lib/mkv-retention-diagnostic.mjs", "scripts/lib/cdp-realm-memory.mjs", "scripts/lib/lifecycle-allocation-attribution.mjs");
  if (startupSimpleControl) sourceFiles.push(startupComplexReference.file);
  if (startupProtected) sourceFiles.push(protectedRepeatReference.file, protectedCompleteVideoReference.file,
    "scripts/lib/mkv-protected-repeat-contract.mjs", ...startupSmallRegressions.map(ref => ref.file));
  if (positiveStartCandidate) sourceFiles.push("scripts/prepare-h264-positive-start-fixture.mjs");
  if (pinnedHevc) sourceFiles.push("scripts/lib/mkv-exact-aac-staged-reference.mjs", mkvStagedReference.file, mkvHevcRegressionFixture.file, mkvHevcRegressionFixture.file + ".json");
  if (probeHevcControl) sourceFiles.push(mkvFixedHevcReference.file);
  report.sourcePins = Object.fromEntries(await Promise.all(sourceFiles.map(async file => [file, await hashFile(path.join(root, file))])));
  report.executedHead = (await execute(process.env.WITHIN_GIT_EXECUTABLE ?? "git", ["rev-parse", "HEAD"], { cwd: root, windowsHide: true })).stdout.trim();
  if (!protectedMode) fixtureRuntime = await createOwnedRuntimeScratch("mkv-direct-reuse-fixture-");
  let candidate;
  if (editListCandidate) {
    toolRuntime = await createOwnedRuntimeScratch("mkv-edit-list-tool-download-");
    candidate = await loadMkvEditListBuildArtifact(process.argv[3], process.argv[4], toolRuntime, exactAacCandidate, h264Vfr, probeDecoder, startupCore, hevcKnownDts, hevcHeaderParser);
    report.candidateBuild = candidate.proof;
    if (startupCore && !hevcKnownDts) assertMkvStartupCore(candidate.proof);
    if (hevcKnownDts) {
      assert.equal(candidate.proof.build.source.candidateWrapperSha256, hevcKnownDtsWrapperSha256);
      assert.equal(candidate.proof.build.source.hevcKnownDtsPreserved, true);
      assert.equal(candidate.proof.build.source.hevcNominalDtsSynthesis, false);
      assert.deepEqual(candidate.proof.build.source.library.enabledDecoders, ["h264"]);
    }
    if (headerH264Regression) {
      assertHevcHeaderParserCore(candidate.proof);
      report.currentCoreLoopReference = readHevcHeaderLoopReference(await readFile(path.join(root, hevcHeaderLoopReference.file)), candidate.proof);
    }
  }
  if (protectedMode) {
    if (headerProtected) {
      assertHevcHeaderParserCore(candidate.proof);
      report.currentCoreLoopReference = readHevcHeaderLoopReference(await readFile(path.join(root, hevcHeaderLoopReference.file)), candidate.proof);
      report.currentCoreH264Regressions = readHeaderCoreH264Regressions(await Promise.all(headerCoreH264References.map(ref => readFile(path.join(root, ref.file)))), candidate.proof);
    } else if (startupProtected) {
      report.currentCoreSmallRegressions = readStartupSmallRegressions(await Promise.all(startupSmallRegressions.map(ref => readFile(path.join(root, ref.file)))), candidate.proof);
    } else {
    const bytes = await readFile(path.join(root, sustainedControl.file)); assert.equal(sha(bytes), sustainedControl.sha256);
    const prior = JSON.parse(bytes);
    assert.equal(prior.status, "passed-sustained-exact-aac-destination-comparison-not-public-acceptance");
    assertSameMkvNativeBuild(prior.candidateBuild, candidate.proof);
    assert.ok(prior.arms.some(a => a.mode === "reuse" && a.status === "passed-sustained-exact-aac-destination-arm"));
    report.sustainedControl = sustainedControl;
    }
    report.hostPreflight = await inspectStressHostMemory(); assert.equal(report.hostPreflight.safeToStart, true);
    const env = toolRuntime.env, input = await probeProtected(protectedPath, env);
    assertMkvProtectedSource(input);
    let priming;
    for await (const packet of probeMkvSustainedAac(protectedPath, { cwd: root, env })) { priming = packet.skip; break; }
    assert.equal(priming, mkvProtectedCopy.primingSamples);
    report.fixture = { bytes: mkvProtectedCopy.bytes, sha256: mkvProtectedCopy.sha256, seconds: mkvProtectedCopy.seconds,
      primaryVideo: "HEVC Main 1920x804 24fps", primaryAudio: "HE-AAC 48kHz 5.1", declaredPrimingSamples: priming };
    const browser = await inspectInstalledChromePin();
    const baseline = { browser, probe: input, candidate };
    if (headerProtected && !headerProtectedRepeats) {
      baseline.priorCompleteVideo = readPriorCompleteProtectedVideo(await readFile(path.join(root, protectedCompleteVideoReference.file)));
      report.priorCompleteVideoReference = baseline.priorCompleteVideo;
    }
    if (headerProtectedRepeats) {
      baseline.protectedReference = readHeaderProtectedReference(await readFile(path.join(root, headerProtectedReference.file)), candidate.proof);
      report.protectedReference = baseline.protectedReference;
    } else if (startupProtected || protectedRepeats || protectedFullDecode) {
      baseline.protectedReference = startupProtected ? readStartupProtectedReference(
        await readFile(path.join(root, protectedRepeatReference.file)), await readFile(path.join(root, protectedCompleteVideoReference.file)), candidate.proof)
        : readProtectedRepeatReference(await readFile(path.join(root, protectedRepeatReference.file)), candidate.proof);
      report.protectedReference = baseline.protectedReference;
    }
    if (protectedRepeats) {
      for (const count of headerProtectedRetention ? [MKV_RETENTION_LIMITS.jobs] : [3, 1]) {
        await arm("reuse", protectedPath, null, baseline, count);
        assert.equal(report.arms.at(-1).ownedRuntimeRemoved, true, "Previous browser must be cleaned before another session");
        assert.equal(report.arms.at(-1).status, "passed-protected-repeat-session");
      }
    } else await arm("reuse", protectedPath, null, baseline);
    assertInstalledChromePinsEqual(await inspectInstalledChromePin(), browser);
    if (protectedRepeats) {
      assert.deepEqual(report.arms.map(a => a.cases.length), headerProtectedRetention ? [MKV_RETENTION_LIMITS.jobs] : [3, 1]);
      report.status = headerProtectedRetention ? "completed-header-core-protected-retention-diagnostic-not-acceptance" : headerProtectedRepeats ? "passed-header-core-protected-repeats-not-public-acceptance" : startupProtected ? "passed-startup-core-protected-repeats-not-public-acceptance" : "passed-protected-repeats-not-public-acceptance";
    } else if (protectedFullDecode) {
      assert.equal(report.arms[0].status, "passed-protected-complete-video-decode");
      assert.equal(report.arms[0].cases[0].validation.fullVideoDecode, true);
      report.status = "passed-protected-complete-video-decode-not-public-acceptance";
    } else {
      assert.equal(report.arms[0].status, "passed-first-protected-exact-aac-direct-reuse");
      report.status = headerProtected ? "passed-header-core-protected-not-public-acceptance" : startupProtected ? "passed-startup-core-protected-not-public-acceptance" : "passed-first-protected-exact-aac-direct-reuse-not-public-acceptance";
    }
  } else if (scalingLoopControl) {
    const created = await createSmallMkvScalingLoop(fixtureRuntime);
    const baseline = { browser: await inspectInstalledChromePin(), probe: await probe(created.file, fixtureRuntime.env),
      packetHashes: await packets(created.file, fixtureRuntime.env), candidate };
    assert.equal(Number(baseline.probe.streams[0].nb_read_packets), created.expectedVideoPackets);
    report.fixture = { ...created, sha256: await hashFile(created.file), sourceProbe: baseline.probe, sourcePacketHashes: baseline.packetHashes };
    if (hevcKnownDts) {
      const failureFile = "evidence/2026-11-15T00-31-57-030Z-mkv-startup-core-loop-source-control.json";
      const failure = await readFile(path.join(root, failureFile));
      assert.equal(sha(failure), "9e80b288d17288be539864a6493368668b0c18ee9c3f32acce245f580167a5b3");
      const prior = JSON.parse(failure);
      assert.equal(prior.status, "failed-not-acceptance");
      assert.equal(created.bytes, prior.fixture.bytes); assert.equal(report.fixture.sha256, prior.fixture.sha256);
      assert.equal(baseline.packetHashes, prior.fixture.sourcePacketHashes);
      report.unchangedFailedInputReference = { file: failureFile, sha256: sha(failure), sameEntireInputSha256: true };
    }
    await arm("reuse", created.file, fixtureRuntime, baseline);
    assert.equal(report.arms[0].status, "passed-loop-source-fidelity-control");
    assert.equal(await hashFile(created.file), report.fixture.sha256);
    assertInstalledChromePinsEqual(await inspectInstalledChromePin(), baseline.browser);
    report.status = "passed-loop-source-fidelity-control-not-large-file-or-public-acceptance";
  } else if (complexTimeline) {
    const fixture = path.join(fixtureRuntime.directory, `${syntheticName}.mkv`), originalFixture = path.join(root, selectedComplexFixture.file);
    assert.equal((await stat(originalFixture)).size, selectedComplexFixture.bytes);
    assert.equal(await hashFile(originalFixture), selectedComplexFixture.sha256);
    await copyFile(originalFixture, fixture);
    report.fixture = { ...selectedComplexFixture, copiedOnlyIntoOwnedScratch: true };
    const prior = JSON.parse(await readFile(path.join(root, protectedRepeatReference.file)));
    if (h264Vfr) {
      assert.equal(candidate.proof.build.source.candidateWrapperSha256, hevcHeaderParser ? hevcKnownDtsWrapperSha256 : startupCore ? h264StartupWrapperSha256 : probeDecoder ? h264ProbeWrapperSha256 : h264VfrWrapperSha256);
      assert.equal(candidate.proof.build.source.parentWrapperSha256, hevcHeaderParser ? h264StartupWrapperSha256 : startupCore ? h264ProbeWrapperSha256 : probeDecoder ? h264VfrWrapperSha256 : prior.candidateBuild.build.source.candidateWrapperSha256);
      assert.deepEqual(candidate.proof.build.wasmMemory, prior.candidateBuild.build.wasmMemory);
      assert.deepEqual(candidate.proof.build.source.mov, prior.candidateBuild.build.source.mov);
    } else assertSameMkvNativeBuild(prior.candidateBuild, candidate.proof);
    const baseline = { browser: await inspectInstalledChromePin(), probe: await probeProtected(fixture, fixtureRuntime.env), candidate,
      complexPackets: await complexPackets(fixture, fixtureRuntime.env), complexDecodedHashes: await complexDecodedHashes(fixture, fixtureRuntime.env) };
    report.fixture.sourceProbe = baseline.probe;
    report.fixture.decodedHashes = baseline.complexDecodedHashes;
    if (startupSimpleControl) {
      assert.equal(baseline.probe.streams[0].has_b_frames, 0);
      baseline.complexReference = readStartupComplexReference(await readFile(path.join(root, startupComplexReference.file)), report.fixture);
      report.complexReference = baseline.complexReference;
    }
    if (bframeControl) report.fixture.bframeSource = assertBFrameMkvSource(baseline.probe, baseline.complexPackets);
    await arm("reuse", fixture, fixtureRuntime, baseline);
    assert.equal(report.arms[0].status, "passed-complex-exact-aac-direct-reuse");
    assert.equal(await hashFile(fixture), selectedComplexFixture.sha256);
    assertInstalledChromePinsEqual(await inspectInstalledChromePin(), baseline.browser);
    report.status = positiveStartCandidate ? "passed-h264-positive-start-direct-reuse-not-public-acceptance" : bframeControl ? "passed-h264-bframes-direct-reuse-not-public-acceptance" : "passed-complex-exact-aac-direct-reuse-not-public-acceptance";
  } else {
  const fixture = path.join(fixtureRuntime.directory, `${syntheticName}.mkv`);
  if (sustained) {
    const bytes = await readFile(path.join(root, smallControl.file)); assert.equal(sha(bytes), smallControl.sha256);
    const small = JSON.parse(bytes);
    assert.equal(small.status, "passed-small-exact-aac-destination-control-not-speed-or-public-acceptance");
    assert.deepEqual(small.candidateBuild, candidate.proof);
    report.smallControl = smallControl;
  }
  if (pinnedHevc) {
    const reusable = path.join(root, mkvHevcRegressionFixture.file);
    assert.equal((await lstat(reusable)).size, mkvHevcRegressionFixture.bytes);
    assert.equal(await hashFile(reusable), mkvHevcRegressionFixture.sha256);
    await copyFile(reusable, fixture);
  } else await runNative(ffmpeg, ["-v", "error", "-n", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=24",
    "-f", "lavfi", "-i", "sine=frequency=553:sample_rate=48000", "-t", sustained ? "170" : "12", "-c:v", "libx265", "-preset", "ultrafast",
    "-x265-params", sustained ? "pools=2:frame-threads=1:log-level=error:keyint=48" : "pools=1:frame-threads=1:log-level=error:keyint=48",
    "-b:v", sustained ? "9000k" : "3600k", ...(sustained ? ["-maxrate", "9000k", "-bufsize", "18000k", "-fs", String(maxSustainedBytes)] : []),
    "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", fixture], fixtureRuntime.env, sustained ? 240000 : 90000);
  const bytes = (await stat(fixture)).size;
  report.generatedFixtureBytes = bytes;
  assert.ok(sustained ? bytes >= minSustainedBytes && bytes <= maxSustainedBytes : bytes > 2 * mib && bytes < 8 * mib, `Unexpected fixture size: ${bytes}`);
  const inputProbe = await probe(fixture, fixtureRuntime.env), packetHashes = await packets(fixture, fixtureRuntime.env);
  assert.deepEqual(inputProbe.streams.map(s => s.codec_name), ["hevc", "aac"]);
  assert.match(packetHashes, /^0,v,SHA256=[a-f0-9]{64}\r?\n1,a,SHA256=[a-f0-9]{64}$/i);
  report.fixture = { bytes, sha256: await hashFile(fixture), packetHashes };
  const baseline = { browser: await inspectInstalledChromePin(), probe: inputProbe, packetHashes,
    ...(sustained ? { sourcePcm: await decodedPcm(fixture, fixtureRuntime.env) } : { clocks: await packetClocks(fixture, fixtureRuntime.env) }) };
  if (stagedDiagnostic || editListCandidate) {
    const file = "evidence/2026-11-08T00-23-59-928Z-mkv-direct-reuse.json", retained = await readFile(path.join(root, file));
    const digest = sha(retained); assert.equal(digest, "1106498457688f125da4e7bce849af797293c63820a87bdc18025da0449553ac");
    baseline.retained = JSON.parse(retained); report.retainedDirectControl = { file, sha256: digest };
    if (!sustained) {
      assert.equal(packetHashes, baseline.retained.fixture.packetHashes);
      if (!pinnedHevc) assert.equal(bytes, baseline.retained.fixture.bytes);
    }
    for (const file of ["public/engines/remux/within-direct.mjs", "public/engines/remux/within-direct.wasm"])
      assert.equal(report.sourcePins[file], baseline.retained.sourcePins[file]);
    if (sustained) {
      assert.equal(inputProbe.format.format_name, "matroska,webm");
      assert.ok(Math.abs(Number(inputProbe.format.duration) - 170) < 0.05);
      assert.equal(Number(inputProbe.streams[0].nb_read_packets), 4080);
      report.fixture.durationSeconds = Number(inputProbe.format.duration);
      report.fixture.decodedPcm = baseline.sourcePcm;
      baseline.candidate = candidate;
      for (const mode of ["edit-list", "fresh", "reuse"]) {
        await arm(mode, fixture, fixtureRuntime, baseline);
        const outcome = report.arms.at(-1);
        assert.equal(outcome.ownedRuntimeRemoved, true, "Previous browser ownership must be resolved before a new arm");
        if (mode === "edit-list") assert.equal(outcome.status, "passed-sustained-exact-aac-destination-arm");
      }
      report.sustainedReference = baseline.reference;
    } else if (editListCandidate) {
      baseline.candidate = candidate;
      baseline.aac = { pcm: await decodedPcm(fixture, fixtureRuntime.env), packets: await aacPackets(fixture, fixtureRuntime.env) };
      report.fixture.aac = { pcm: baseline.aac.pcm, packets: baseline.aac.packets.length, edges: [baseline.aac.packets[0], baseline.aac.packets.at(-1)] };
      if (pinnedHevc) {
        const contentReference = readMkvHevcRegressionReference(await readFile(path.join(root, mkvStagedReference.file)), report.fixture);
        report.hevcContentReference = contentReference;
        if (probeHevcControl) {
          baseline.hevcReference = readMkvFixedHevcReference(await readFile(path.join(root, mkvFixedHevcReference.file)), report.fixture);
          report.hevcReference = baseline.hevcReference;
        }
      }
      if (exactAacCandidate) {
        const file = "evidence/2026-11-08T00-57-09-678Z-mkv-edit-list-candidate.json";
        const prior = await readFile(path.join(root, file)), sha256 = sha(prior);
        assert.equal(sha256, "a3517df868618a75f1e2c6576361eb2e189bcac42659acb809b66f8d1d926e7b");
        const predecessor = JSON.parse(prior);
        assert.deepEqual(report.fixture.aac, predecessor.fixture.aac, "Same source PCM and declared priming are required");
        assert.equal(report.fixture.packetHashes, predecessor.fixture.packetHashes);
        report.retainedTrimFailure = { file, sha256 };
      }
      if (compareDestinations) {
        baseline.reference = readMkvExactAacStagedReference(await readFile(path.join(root, mkvStagedReference.file)), candidate.proof, report.fixture);
        report.stagedReference = baseline.reference;
        for (const mode of ["edit-list", "fresh", "reuse"]) {
          await arm(mode, fixture, fixtureRuntime, baseline);
          const outcome = report.arms.at(-1);
          assert.equal(outcome.ownedRuntimeRemoved, true, "Previous browser ownership must be resolved before a new arm");
          if (mode === "edit-list") assert.equal(outcome.status, "passed-small-exact-aac-destination-arm");
        }
      } else await arm(pinnedHevc ? "reuse" : "edit-list", fixture, fixtureRuntime, baseline);
    } else await arm("staged", fixture, fixtureRuntime, baseline);
  } else for (const mode of ["fresh", "reuse"]) await arm(mode, fixture, fixtureRuntime, baseline);
  assert.equal(await hashFile(fixture), report.fixture.sha256);
  assertInstalledChromePinsEqual(await inspectInstalledChromePin(), baseline.browser);
  if (compareDestinations) {
    assert.deepEqual(report.arms.map(a => a.mode), ["edit-list", "fresh", "reuse"]);
    assert.ok(report.arms.every(a => a.status === (sustained ? "passed-sustained-exact-aac-destination-arm" : "passed-small-exact-aac-destination-arm")));
    const [, fresh, reuse] = report.arms;
    for (const key of ["commonPrivateWorkerSha256", "commonPrivateWriterSha256", "releaseWorkerSha256"]) assert.equal(fresh.overlay[key], reuse.overlay[key]);
    assert.notEqual(fresh.overlay.mediaArmSha256, reuse.overlay.mediaArmSha256);
    report.status = sustained ? "passed-sustained-exact-aac-destination-comparison-not-public-acceptance" : "passed-small-exact-aac-destination-control-not-speed-or-public-acceptance";
  } else if (fixedHevcBaseline) {
    assert.equal(report.arms[0].status, "passed-fixed-input-hevc-baseline");
    report.status = "passed-fixed-input-hevc-baseline-not-public-acceptance";
  } else if (probeHevcControl) {
    assert.equal(report.arms[0].status, "passed-probe-decoder-hevc-regression");
    report.status = "passed-probe-decoder-hevc-regression-not-public-acceptance";
  } else if (editListCandidate) {
    assert.equal(report.arms[0].status, "passed-unpublished-small-staged-clock-control");
    report.status = "passed-unpublished-small-staged-clock-control-not-public-acceptance";
  } else if (stagedDiagnostic) {
    assert.equal(report.arms[0].status, "completed-staged-timeline-diagnostic-not-acceptance");
    report.status = "completed-public-staged-clock-diagnostic-not-acceptance";
  } else {
    assert.ok(report.arms.every(a => a.status === "passed-private-small-direct-control"));
    const [fresh, reuse] = report.arms;
    for (const key of ["commonPrivateWorkerSha256", "commonPrivateWriterSha256", "releaseWorkerSha256"]) assert.equal(fresh.overlay[key], reuse.overlay[key]);
    assert.equal(new Set(report.arms.flatMap(a => a.cases.flatMap(c => c.validation?.outputSha256 ?? []))).size, 1);
    report.status = "passed-small-real-direct-buffer-ab-not-speed-or-public-acceptance";
  }
  }
} catch (error) { report.status = "failed-not-acceptance"; report.failures.push(String(error.stack ?? error).slice(0, 2048)); }
finally {
  await finishOwnedCleanup([
    async () => { if (toolRuntime) { await toolRuntime.close(); report.toolDownloadRemoved = true; } },
    async () => { if (fixtureRuntime) {
      assert.ok(report.arms.every(arm => arm.ownedRuntimeRemoved), "Never remove a fixture while browser ownership is unresolved");
      await fixtureRuntime.close(); report.fixtureRuntimeRemoved = true;
    } },
    async () => { report.originalAfter = await original(); assert.deepEqual(report.originalAfter, report.originalBefore); },
    async () => { for (const [file, pin] of Object.entries(report.sourcePins ?? {})) assert.equal(await hashFile(path.join(root, file)), pin); },
  ]).catch(error => { report.status = "failed-not-acceptance"; report.cleanupFailureDetails = boundedErrorDetails(error); report.failures.push(...error.errors.map(item => String(item).slice(0, 1024))); });
  const file = `${prefix}.json`; await writeFile(path.join(root, file), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ file, status: report.status, arms: report.arms.map(a => ({ mode: a.mode, status: a.status, failures: a.failures })), failures: report.failures }));
  if (report.status.startsWith("failed")) process.exitCode = 1;
}
