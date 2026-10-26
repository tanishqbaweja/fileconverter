import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { VORBIS_LARGE_FIXTURE } from "../scripts/lib/vorbis-large-fixture.mjs";
test("large input policy pins the genuine historical147964541B/2300s stereo source, never a short/sparse substitute", async () => {
  assert.equal(VORBIS_LARGE_FIXTURE.bytes, 147964541); assert.equal(VORBIS_LARGE_FIXTURE.durationSeconds, 2300);
  assert.equal(VORBIS_LARGE_FIXTURE.frames, 110400000); assert.equal(VORBIS_LARGE_FIXTURE.channels, 2); assert.equal(VORBIS_LARGE_FIXTURE.sampleRate, 48000);
  assert.equal(VORBIS_LARGE_FIXTURE.sha256, "ec870c32bae0e5c41eb449f3d24fbc470636dfa804431e20a9eb7aef6ad9ff58");
  const source = await readFile("scripts/lib/vorbis-large-fixture.mjs", "utf8");
  assert.match(source, /"-n"/); assert.match(source, /seed=424242/); assert.match(source, /seed=242424/);
  assert.match(source, /"-b:a", "512k", "-vbr", "off"/); assert.match(source, /"-t", "2300"/);
  assert.match(source, /assert.equal\(sha256, VORBIS_LARGE_FIXTURE.sha256/); assert.match(source, /windowsHide: true/);
  assert.doesNotMatch(source, /truncate\(|copyFile\(|sparse|\.arrayBuffer\(/);
});
test("three real same-page full-size jobs keep the normal browser, automatic nativearg3, fixed queues and complete PCM/legacy quality gates", async () => {
  const source = await readFile("scripts/test-audio-metadata-production-runtime.mjs", "utf8");
  assert.match(source, /--vorbis-large-repeat/); assert.match(source, /largeVorbisRepeat \? Array.from\(\{ length: 3 \}/);
  assert.match(source, /compareNativeLongAudioPcm\(input, output, \{ cwd: root, env, channels: 2, expectedFrames: 110400000 \}\)/);
  assert.match(source, /Unchanged legacy loaded-idle cleanup96MiB/);
  assert.match(source, /actualAutomaticQualityArgument = state.metrics.audioQualityArgument/);
  assert.match(source, /assert.equal\(row.output.sha256, report.cases\[0\].output.sha256/);
  assert.match(source, /First invalid large result retained; do not repeat it unchanged/);
  assert.match(source, /journal.peaksExcept\(\["blank"\]\)/); assert.match(source, /largeBudgetFailure/);
  assert.equal(source.split("chromium.launchPersistentContext(").length - 1, 1);
  assert.doesNotMatch(source, /disable.*(?:OnDevice|on.device)|force.gc|HeapProfiler.collectGarbage/);
});
test("large fixture preserves the actual prior SDR policy, not the unrelated small-tone60dB PSNR diagnostic", async () => {
  assert.equal(VORBIS_LARGE_FIXTURE.minimumChannelSdrDb, -6.5);
  const prior = await readFile("scripts/memory-profile.mjs", "utf8");
  assert.match(prior, /vorbisTranscodeOutput \|\| wmaOutput\s*\? -6\.5/);
  assert.match(prior, /comparisonFilter.replace\("apsnr\[quality\]", "asdr\[quality\]"\)/);
  const small = await readFile("scripts/lib/streaming-audio-fidelity.mjs", "utf8");
  assert.match(small, /minimumPsnrDb = 60/); assert.match(small, /minimumPsnrDb >= 60/);
});
test("first full-size q7 run stays FAILED at250.699MiB and safety-cancelled, never accepted as an output or repeated unchanged", async () => {
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const receipt = JSON.parse(await readFile("evidence/2026-10-26T00-31-01.120Z-audio-metadata-fidelity-result.json"));
  assert.equal(receipt.status, "failed"); assert.equal(receipt.publicAcceptance, false); assert.equal(receipt.cases.length, 1);
  assert.equal(receipt.memory.incrementalPrivateMiB, 250.69921875); assert.equal(receipt.memory.validSamples, 535); assert.equal(receipt.memory.unavailableSamples, 1);
  const archive = await readFile(receipt.archive.path); assert.equal(sha(archive), receipt.archive.sha256);
  const raw = gunzipSync(archive, { maxOutputLength: 1048576 }); assert.equal(sha(raw), receipt.archive.restoredSha256);
  const report = JSON.parse(raw), row = report.cases[0];
  assert.equal(report.largeAudioFixture.bytes, VORBIS_LARGE_FIXTURE.bytes); assert.equal(report.largeAudioFixture.sha256, VORBIS_LARGE_FIXTURE.sha256);
  assert.equal(report.largeAudioFixture.frames, 110400000); assert.equal(report.longDecoderProbe.exact, true); assert.equal(report.longDecoderProbe.samples, 96000);
  assert.equal(row.status, "failed"); assert.equal(row.browserState.jobState, "cancelled");
  assert.equal(row.browserState.metrics.inputBytes, 26017563); assert.equal(row.browserState.metrics.outputBytes, 11284458);
  assert.equal(row.browserState.metrics.peakWasmMemoryBytes, 33554432); assert.equal(row.browserState.metrics.peakPendingOperations, 1);
  assert.equal(row.browserState.metrics.maxReadChunkBytes, 262144); assert.equal(row.browserState.metrics.maxWriteChunkBytes, 29519);
  assert.deepEqual(row.browserState.opfsNames, []); assert.equal(row.browserState.opfsName, null); assert.equal(row.disposableOutputRemoved, true);
  assert.equal(row.output, undefined); assert.equal(row.fidelity, undefined); assert.match(row.failures[0], /exceeded250MiB/);
  assert.ok(row.cleanupDeltaFromLoadedMiB > 96); assert.equal(row.browserState.workerStatus, "starting"); // Not a successful recovery claim.
  assert.equal((report.memory.peak.privateBytes - report.blankBaseline.privateBytes) / 1048576, receipt.memory.incrementalPrivateMiB);
  assert.equal(report.memoryObserverOwnership.processNameOrSandboxExclusions, false); assert.equal(report.memoryObserverOwnership.memoryFormulaChanged, false);
  const journal = await readFile(receipt.losslessJournal.file); assert.equal(sha(journal), receipt.losslessJournal.archiveSha256);
  assert.equal(sha(gunzipSync(journal, { maxOutputLength: 8 * 1048576 })), receipt.losslessJournal.sha256);
  assert.equal(report.processCleanup.length, 14); assert.ok(Object.values(receipt.cleanup).every(Boolean)); assert.equal(receipt.protectedOriginalUnchanged, true);
});
