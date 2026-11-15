import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { assertHevcHeaderParserCore } from "../scripts/lib/mkv-hevc-header-core-reference.mjs";
import { renderHeaderProtectedReport } from "../scripts/lib/mkv-header-protected-report.mjs";
const stem = "evidence/2026-11-15T08-35-42-532Z-mkv-hevc-header-core-protected";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
async function load() {
  const bytes = await readFile(stem + ".json"); assert.equal(sha(bytes), "5529d464b9248226ab79d3e0dc858e7dada90d15e2c235e5058f412c4b3f4039");
  return JSON.parse(bytes);
}

test("corrected native core genuinely remuxes complete original and independently validates NEW output rather than inheriting an old hash", async () => {
  const r = await load(), [a] = r.arms, [c] = a.cases, v = c.validation;
  assert.equal(r.status, "passed-header-core-protected-not-public-acceptance"); assertHevcHeaderParserCore(r.candidateBuild);
  assert.equal(r.originalMediaSelected, true); assert.equal(r.hevcHeaderProtectedCandidate, true);
  assert.equal(c.selection.completeOriginalSelected, true); assert.equal(c.selection.sourceCopyCreated, false);
  assert.equal(c.selection.alternateConversionPath, false); assert.equal(c.metrics.inputBytes, 2958573265);
  assert.equal(c.metrics.outputBytes, 2962151594);
  assert.equal(v.outputSha256, "64f8a3c3fc8812857ec0c0fd2ec446622100e389e8377911d6d1e0b976fc7b36");
  assert.notEqual(v.outputSha256, r.priorCompleteVideoReference.outputSha256);
  assert.equal(v.fullVideoDecode, true); assert.equal(v.fullVideoDecodeInheritedThroughWholeOutputIdentity, false);
  assert.equal(v.video.packets, 296160); assert.equal(v.video.comparableDts, 296158);
  assert.equal(v.video.maximumPtsDeltaUs, 0); assert.equal(v.video.maximumDtsDeltaUs, 0);
  assert.equal(v.video.maximumIntervalErrorUs, 0); assert.equal(v.video.unavailableSourceDts, 2);
  assert.equal(v.video.generatedStartupDtsValidated, true); assert.equal(v.video.clockToleranceUs, 1000);
  assert.ok(Math.abs(v.video.sourceEndUs - v.video.outputEndUs) <= 1000);
  assert.equal(v.aac.packets, 289221); assert.equal(v.aac.initialSkipSamples, 5058);
  assert.ok(v.aac.maximumPtsErrorSeconds <= 0.001 && v.aac.maximumDtsErrorSeconds <= 0.001);
  assert.ok(v.aac.maximumDurationErrorSeconds <= 0.001 + 1e-12);
  assert.equal(v.aac.sourcePcm, v.aac.outputPcm); assert.equal(v.aac.packetBytesIdentical, true);
  assert.deepEqual(v.codecConfiguration.source, v.codecConfiguration.output);
  assert.deepEqual(v.codecConfiguration.source.map(s => s.bytes), [2519, 4]);
  assert.ok(v.structure.streamPropertiesMatch && v.structure.languagePreserved && v.structure.subtitleDisclosed && v.structure.artworkDisclosed);
  assert.ok(v.structure.durationDeltaSeconds < 0.05); assert.equal(v.serializedTimeline.tracks[1].edits[0].mediaTimeTicks, "5058");
  assert.equal(r.currentCoreH264Regressions.length, 3); assert.ok(r.currentCoreH264Regressions.every(x => x.exactCurrentNativeBuildVerified));
  assert.equal(r.currentCoreLoopReference.noConversionReplay, true);
  assert.deepEqual(a.failures, []); assert.deepEqual(a.forbiddenRequests, []); assert.deepEqual(r.failures, []);
});

test("complete independent video proof is fresh and terminal, with exact frame/timeline/zero-drop guards and no decoded media copy", async () => {
  const r = await load(), c = r.arms[0].cases[0], d = c.validation.completeVideo;
  assert.equal(d.status, "passed-complete-independent-video-decode"); assert.equal(d.decodedFrames, 296160);
  assert.equal(d.finalOutputTimeSeconds, 12340); assert.equal(d.duplicateFrames, 0); assert.equal(d.droppedFrames, 0);
  assert.equal(d.completedProgressReports, 23); assert.equal(d.elapsedMs, 679355); assert.equal(d.deadlineMs, 1800000);
  assert.equal(d.decoderThreads, 4); assert.equal(d.decodedFileCreated, false); assert.equal(d.retainedDecodedFrames, 0);
  assert.equal(d.nativeToolUsedForConversion, false); assert.equal(d.exactBrowserOutputBytes, c.metrics.outputBytes);
  assert.equal(d.extentScope, "fresh-independently-validated-protected-browser-output");
  assert.equal(c.metrics.elapsedMs, 24385.389999985695); assert.ok(d.elapsedMs > c.metrics.elapsedMs * 20);
  assert.equal(c.binding.convertedCopyCreated, false); assert.equal(c.binding.totalBrowserSampleBytes, 12288);
  assert.ok(c.metrics.maxReadChunkBytes <= 262144 && c.metrics.maxWriteChunkBytes <= 1048576 && c.metrics.peakQueuedBytes <= 1048576);
  assert.equal(c.metrics.peakPendingOperations, 1); assert.equal(c.metrics.peakWasmMemoryBytes, 48562176);
  assert.equal(r.nativeConversionUsed, false); assert.equal(r.publicAcceptance, false); assert.equal(r.headed, false);
  assert.equal(r.productionFilesReplaced, false); assert.equal(r.speedGainProven, false);
  assert.equal(r.hostPreflight.safeToStart, true); assert.ok(r.diskPreflight.availableBytes >= r.diskPreflight.requiredBytes);
});

test("major native journal independently rederives full-tree peak/cleanup, byte-reproduces offline CSV/HTML and proves owned cleanup/original preservation", async () => {
  const r = await load(), [a] = r.arms, [c] = a.cases, packed = await readFile(a.archive.file);
  assert.equal(sha(packed), a.archive.sha256); const raw = gunzipSync(packed, { maxOutputLength: 128 * 1048576 });
  assert.equal(sha(raw), a.archive.decodedSha256); const samples = JSON.parse(raw);
  const active = samples.filter(s => Date.parse(s.timestamp) >= a.memory.start && Date.parse(s.timestamp) <= a.memory.end);
  const valid = active.filter(s => s.privateBytes !== null && Array.isArray(s.processes));
  assert.equal(valid.length, 224); assert.equal(active.length - valid.length, 0);
  for (const s of valid) assert.equal(s.processes.reduce((n, p) => n + p.privateBytes, 0), s.privateBytes);
  assert.equal((Math.max(...valid.map(s => s.privateBytes)) - a.blank.privateBytes) / 1048576, 223.46484375);
  assert.equal(a.memory.incrementalPrivateMiB, 223.46484375);
  assert.equal((a.cleanupStable.privateBytes - a.loaded.privateBytes) / 1048576, 18.078125);
  assert.equal(a.memory.cleanupAboveIdleMiB, 18.078125);
  const rendered = renderHeaderProtectedReport(r, samples);
  for (const ext of ["csv", "html"]) assert.equal(await readFile(stem + "." + ext, "utf8"), rendered[ext]);
  assert.match(rendered.html, /Fresh complete independent video decode/); assert.doesNotMatch(rendered.html, /<script|https?:\/\//);
  const wrong = structuredClone(r); wrong.arms[0].memory.incrementalPrivateMiB--;
  assert.throws(() => renderHeaderProtectedReport(wrong, samples));
  const mislabeled = structuredClone(r); mislabeled.arms[0].cases[0].validation.fullVideoDecode = false;
  assert.throws(() => renderHeaderProtectedReport(mislabeled, samples));
  assert.equal(c.outputRemoved, true); assert.equal(a.browserCleanup.status, "owned-observed-pids-absent");
  assert.equal(a.browserCleanup.observedPids.length, 49); assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.toolDownloadRemoved);
  assert.deepEqual(r.originalBefore, r.originalAfter);
  assert.deepEqual(r.originalAfter, { bytes: 2958573265, sha256: "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34" });
});
