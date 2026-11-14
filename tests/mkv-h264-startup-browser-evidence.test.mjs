import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { summarizeProtectedWindow } from "../scripts/lib/mkv-protected-repeat-contract.mjs";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

for (const example of [
  { file: "evidence/2026-11-14T23-48-39-600Z-mkv-startup-dts-bframes.json", digest: "8c8824bda4c4f273693f2356a069b80e3af1047cac3df5eeb8a7390c42995fc9",
    offset: 0, hash: "5958e362932a277ceba09d4734c3428dd8d5f8759b51e30fb18dde6723c70a0e", bytes: 767355, peak: 181.01171875, cleanup: 45.5078125, valid: 133, pids: 44 },
  { file: "evidence/2026-11-14T23-50-09-667Z-mkv-startup-dts-positive.json", digest: "28cbb51c8a45237f312b33e773e30316fd6277aedeb2653a280870b3a42bf646",
    offset: 5, hash: "e63d72546361c88aa7746265439d425fe834c562794f5d9ce7c1557d227934cf", bytes: 767391, peak: 179.6015625, cleanup: 52.28125, valid: 132, pids: 42 },
]) test(`Real startup candidate preserves B-frame/VFR/two-AAC timing at ${example.offset}s and recovers within full-tree memory limits`, async () => {
  const bytes = await read(example.file); assert.equal(sha(bytes), example.digest);
  const r = JSON.parse(bytes), [arm] = r.arms;
  assert.equal(r.status, example.offset ? "passed-h264-positive-start-direct-reuse-not-public-acceptance" : "passed-h264-bframes-direct-reuse-not-public-acceptance");
  assert.equal(r.h264StartupDtsCandidate, true); assert.equal(r.headed, false); assert.equal(r.browserServicesDisabled, false);
  assert.equal(r.candidateBuild.runId, "43653656481"); assert.equal(r.candidateBuild.head, "147b05167d5d5729a8aa186c2c073c833816aa3c");
  const build = r.candidateBuild.build;
  assert.equal(build.artifacts["within-direct.wasm"].sha256, "62cf939ce720022ebf73e2f7dcf82fcdcfc33e7e4221334d691b992a2f4ae8ef");
  assert.equal(build.artifacts["within-direct.wasm"].bytes, 2402739);
  assert.equal(build.source.startupMaximumPayloadBytes, 2097152); assert.equal(build.source.startupMaximumInspectedPackets, 4096);
  assert.equal(build.source.startupMaximumVideoPackets, 33); assert.equal(build.source.knownPacketClocksRewritten, false);
  assert.deepEqual(build.source.library.enabledDecoders, ["h264"]);
  assert.deepEqual(arm.cases.map(c => c.state), ["complete", "cancelled", "error", "complete"]);
  for (const c of [arm.cases[0], arm.cases[3]]) {
    assert.equal(c.metrics.outputBytes, example.bytes); assert.equal(c.validation.outputSha256, example.hash);
    assert.ok(c.validation.fullDecode && c.validation.candidateGate.passed);
    assert.equal(c.validation.outputDecodedHashes, c.validation.sourceDecodedHashes);
    assert.deepEqual(c.validation.packets.packetCounts, [72, 189, 189]); assert.equal(c.validation.packets.packetBytesIdentical, true);
    assert.deepEqual(c.validation.packets.clocks.map(p => p.maximumPtsErrorUs), [0, 333, 333]);
    assert.equal(c.validation.packets.clocks[0].maximumComparableDtsErrorUs, 0); assert.equal(c.validation.packets.clocks[0].comparableDts, 70);
    assert.deepEqual(c.validation.packets.aac.map(a => a.initialSkipSamples), [1024, 1024]);
    assert.deepEqual(c.validation.startupDts.expectedInitialDtsUs, [-167000 + example.offset * 1000000, -84000 + example.offset * 1000000]);
    const timeline = c.validation.presentationTimeline;
    assert.equal(timeline.source.start, example.offset); assert.equal(timeline.output.start, example.offset);
    assert.ok(Math.abs(timeline.source.end - timeline.output.end) < 1e-9);
    assert.equal(timeline.noTimestampRebasing, true); assert.equal(timeline.completeDecodedContentEqual, true);
    assert.equal(timeline.headerToleranceSeconds, 0.05); assert.equal(timeline.clockToleranceSeconds, 0.001);
    assert.equal(timeline.outputProbeDurationErrorSeconds, 0); assert.equal(timeline.expectedOutputReportedDuration, 4.083);
    assert.equal(timeline.serializedUnknownDurationsAndEditsChecked, true);
    assert.equal(c.validation.outputProbe.format.start_time, example.offset ? "5.000000" : "0.000000");
    assert.ok(c.validation.warnings.some(w => /Missing initial H\.264 decode timestamps reconstructed/.test(w)));
    assert.equal(c.binding.convertedCopyCreated, false); assert.equal(c.binding.allOutputBytesCompared, false);
    assert.ok(c.metrics.maxReadChunkBytes <= 262144 && c.metrics.maxWriteChunkBytes <= 1048576);
    assert.ok(c.metrics.peakQueuedBytes <= 1048576 && c.metrics.peakPendingOperations === 1);
    assert.equal(c.metrics.peakWasmMemoryBytes, 24 * 1048576); assert.equal(c.metrics.peakScratchBytes ?? 0, 0);
  }
  const packed = await read(arm.archive.file); assert.equal(sha(packed), arm.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 2 * 1024 ** 2 }); assert.equal(sha(raw), arm.archive.decodedSha256);
  const memory = summarizeProtectedWindow(JSON.parse(raw), arm.memory, arm.blank.privateBytes);
  assert.equal(memory.incrementalPrivateMiB, example.peak); assert.ok(memory.incrementalPrivateMiB <= 250);
  assert.equal(memory.cleanupAboveIdleMiB, example.cleanup); assert.ok(memory.cleanupAboveIdleMiB <= 96);
  assert.equal(memory.validSamples, example.valid); assert.equal(memory.unavailableSamples, 0);
  assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent"); assert.equal(arm.browserCleanup.observedPids.length, example.pids);
  assert.ok(arm.ownedRuntimeRemoved && arm.serverCleanup.ownedRootAbsent && r.toolDownloadRemoved && r.fixtureRuntimeRemoved);
  assert.deepEqual(r.originalBefore, r.originalAfter); assert.equal(r.originalAfter.bytes, 2958573265);
  for (const field of ["nativeConversionUsed", "productionFilesReplaced", "speedGainProven", "originalMediaSelected", "publicAcceptance"]) assert.equal(r[field], false);
});

test("Initial raw-duration failure and its diagnostic stay failed, not retroactively accepted after semantic validation", async () => {
  for (const [file, hash] of [
    ["evidence/2026-11-14T23-41-47-534Z-mkv-startup-dts-bframes.json", "c836a0a2acfa8776b649c17ed0c31ccd7a76c2847b7f4b0c024717ca8daec24a"],
    ["evidence/2026-11-14T23-44-15-049Z-mkv-startup-dts-bframes.json", "5605cfcd537e475fa5a5fa0c5d3ee08aa905a6e2681df37b4efa96d74044b265"],
  ]) {
    const raw = await read(file); assert.equal(sha(raw), hash); const r = JSON.parse(raw), [a] = r.arms;
    assert.equal(r.status, "failed-not-acceptance"); assert.equal(a.cases.length, 1);
    assert.match(a.failures[0], /duration differs by at least 50 ms/); assert.equal(a.memory.cleanupAboveIdleMiB, null);
    assert.equal(a.cases[0].validation.outputSha256, "5958e362932a277ceba09d4734c3428dd8d5f8759b51e30fb18dde6723c70a0e");
    assert.ok(a.ownedRuntimeRemoved && a.serverCleanup.ownedRootAbsent && r.toolDownloadRemoved && r.fixtureRuntimeRemoved);
    assert.deepEqual(r.originalBefore, r.originalAfter);
  }
});
