import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { mkvStagedReference, readMkvExactAacStagedReference } from "../scripts/lib/mkv-exact-aac-staged-reference.mjs";

const read = name => readFile(new URL(`../${name}`, import.meta.url));
const sha = value => createHash("sha256").update(value).digest("hex");

test("Destination comparison refuses changed evidence, tools or source audio", async () => {
  const bytes = await read(mkvStagedReference.file), { candidateBuild, fixture } = JSON.parse(bytes);
  assert.deepEqual(readMkvExactAacStagedReference(bytes, candidateBuild, fixture), { ...mkvStagedReference,
    outputSha256: "6a45619c0e9af37a2ff9577b0a520b45d322cdccb8b4aec4f3fdfc361776becf", outputBytes: 5948960 });
  assert.throws(() => readMkvExactAacStagedReference(Buffer.concat([bytes, Buffer.from("\n")]), candidateBuild, fixture));
  assert.throws(() => readMkvExactAacStagedReference(bytes, { ...candidateBuild, runId: "12345" }, fixture));
  assert.throws(() => readMkvExactAacStagedReference(bytes, candidateBuild, { ...fixture, aac: null }));
});

test("Corrected staged and direct destination arms produce the same real MP4 without claiming sustained speed", async () => {
  const bytes = await read("evidence/2026-11-08T01-21-27-483Z-mkv-exact-aac-destination-control.json");
  assert.equal(sha(bytes), "3eca8a3b925ef55fb22cb444f42a237ab12ed412c6c613d06264903d22e777bb");
  const report = JSON.parse(bytes), [staged, fresh, reuse] = report.arms;
  assert.equal(report.status, "passed-small-exact-aac-destination-control-not-speed-or-public-acceptance");
  assert.deepEqual(report.arms.map(arm => arm.mode), ["edit-list", "fresh", "reuse"]);
  assert.equal(staged.workerResponses, 0);
  assert.ok(fresh.workerResponses > 0 && reuse.workerResponses > 0);
  for (const key of ["commonPrivateWorkerSha256", "commonPrivateWriterSha256", "releaseWorkerSha256"])
    assert.equal(fresh.overlay[key], reuse.overlay[key]);
  assert.notEqual(fresh.overlay.mediaArmSha256, reuse.overlay.mediaArmSha256);
  assert.deepEqual(report.arms.map(arm => arm.memory.incrementalPrivateMiB), [100.79296875, 169.98046875, 132.4609375]);
  assert.equal(report.arms.reduce((total, arm) => total + arm.memory.validSamples, 0), 394);
  for (const arm of report.arms) {
    assert.deepEqual(arm.engineResponses, { module: 3, wasm: 3 });
    assert.deepEqual(arm.cases.map(row => row.state), ["complete", "error", "complete"]);
    assert.equal(arm.cases[1].onlyEmptyPlaceholders, true);
    assert.ok(arm.cases.every(row => row.outputRemoved));
    for (const row of [arm.cases[0], arm.cases[2]]) {
      assert.equal(row.validation.outputSha256, report.stagedReference.outputSha256);
      assert.equal(row.metrics.outputBytes, 5948960);
      assert.equal(row.metrics.peakScratchBytes ?? 0, arm === staged ? 5948960 : 0);
      assert.ok(row.validation.fullDecode && row.validation.candidateGate.passed);
      assert.equal(row.validation.aac.packetTimingAndTrim.initialSkipSamples, 1024);
      assert.equal(row.validation.aac.outputPcm, row.validation.aac.sourcePcm);
      assert.ok(row.metrics.peakQueuedBytes <= 2 ** 20 && row.metrics.peakPendingOperations === 1);
    }
    assert.deepEqual(arm.forbiddenRequests, []);
    assert.equal(arm.memory.unavailableSamples, 0);
    assert.ok(arm.ownedRuntimeRemoved && arm.serverCleanup.ownedRootAbsent);
    assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent");
    const archive = await read(arm.archive.file);
    assert.equal(sha(archive), arm.archive.sha256);
    assert.equal(sha(gunzipSync(archive, { maxOutputLength: 2 * 1024 ** 2 })), arm.archive.decodedSha256);
  }
  assert.deepEqual(report.originalBefore, report.originalAfter);
  assert.ok(report.fixtureRuntimeRemoved && report.toolDownloadRemoved);
  for (const key of ["originalMediaSelected", "speedGainProven", "publicAcceptance", "headed"]) assert.equal(report[key], false);
});

test("Real MKV edit-list output restores exact clocks but fails source-declared AAC trim and PCM", async () => {
  const bytes = await read("evidence/2026-11-08T00-57-09-678Z-mkv-edit-list-candidate.json");
  assert.equal(sha(bytes), "a3517df868618a75f1e2c6576361eb2e189bcac42659acb809b66f8d1d926e7b");
  const report = JSON.parse(bytes), [arm] = report.arms, [job] = arm.cases, v = job.validation;
  assert.equal(report.status, "failed-not-acceptance");
  assert.equal(report.candidateBuild.runId, "42431402082");
  assert.equal(report.candidateBuild.build.artifacts["within-direct.wasm"].sha256, "f313b5aaa78ec7d6b98e33741241d176d07d92eaf63bcb5ebb14b45989a3273e");
  assert.deepEqual(arm.engineResponses, { module: 1, wasm: 1 });
  assert.equal(arm.workerResponses, 0);
  assert.deepEqual(arm.forbiddenRequests, []);
  assert.equal(v.packetHashes, report.fixture.packetHashes);
  assert.deepEqual(v.clocks.map(track => [track.packets, track.maximumPtsErrorUs, track.maximumComparableDtsErrorUs]), [[288, 0, 0], [564, 0, 0]]);
  assert.ok(v.clocks.every(track => track.outputDtsMonotonic));
  assert.equal(v.timingGate.passed, true);
  assert.equal(v.fullDecode, true);
  assert.equal(v.serializedTimeline.mediaPayloadBytesRead, 0);
  const audio = v.serializedTimeline.tracks.find(track => track.kind === "soun");
  assert.equal(audio.edits[0].mediaTimeTicks, "1008");
  assert.equal(audio.timeScale * -v.clocks[1].sourceFirstDecodeOrderPtsUs, 1008 * 1e6);
  assert.equal(report.fixture.aac.edges[0].side_data_list[0].skip_samples, 1024);
  assert.equal(v.aac.outputEdges[0].side_data_list[0].skip_samples, 1008);
  assert.notEqual(v.aac.sourcePcm, v.aac.outputPcm);
  assert.equal(v.candidateGate.passed, false);
  assert.equal(arm.cases.length, 1);
  assert.equal(report.speedGainProven, false);
  assert.equal(report.publicAcceptance, false);
  assert.equal(report.originalMediaSelected, false);
  assert.deepEqual(report.originalBefore, report.originalAfter);
  assert.ok(report.fixtureRuntimeRemoved && report.toolDownloadRemoved && arm.ownedRuntimeRemoved && job.outputRemoved);
  assert.equal(arm.browserCleanup.observedPids.length, 34);
  assert.equal(arm.browserCleanup.status, "owned-observed-pids-absent");
  assert.equal(arm.serverCleanup.ownedRootAbsent, true);
  assert.equal(arm.memory.validSamples, 105);
  assert.equal(arm.memory.unavailableSamples, 0);
  assert.equal(arm.memory.incrementalPrivateMiB, 59.15625);
  assert.equal(arm.memory.cleanupAboveIdleMiB, 16.70703125);
  const archive = await read(arm.archive.file);
  assert.equal(sha(archive), arm.archive.sha256);
  assert.equal(sha(gunzipSync(archive, { maxOutputLength: 2 * 1024 ** 2 })), arm.archive.decodedSha256);
});

test("Exact AAC edit-list candidate preserves all packet and decoded audio content and recovers in the real browser", async () => {
  const bytes = await read("evidence/2026-11-08T01-16-10-010Z-mkv-edit-list-aac-candidate.json");
  assert.equal(sha(bytes), "e35ecbb2b7c882aa0a7a117a9babff9de71d5343cfa4d5009b9a78e2fd8c8c9f");
  const report = JSON.parse(bytes), [arm] = report.arms, [first, cancelled, fault, recovered] = arm.cases;
  assert.equal(report.status, "passed-unpublished-small-staged-clock-control-not-public-acceptance");
  assert.equal(report.candidateBuild.runId, "42432771502");
  assert.equal(report.candidateBuild.build.artifacts["within-direct.wasm"].sha256, "f56a8592f81294dc07190f400d9ce1399361ebfe963a558ff63bff4041707be7");
  assert.equal(report.candidateBuild.build.artifacts["within-direct.mjs"].sha256, "fe3567c6e025d3cd6085e5e2e846bddac0426dd4fbf91d53145b5d011a8d7079");
  assert.deepEqual(arm.engineResponses, { module: 4, wasm: 4 });
  assert.equal(arm.workerResponses, 0);
  assert.deepEqual(arm.forbiddenRequests, []);
  for (const { state, metrics, validation: v } of [first, recovered]) {
    assert.equal(state, "complete");
    assert.equal(v.packetHashes, report.fixture.packetHashes);
    assert.deepEqual(v.clocks.map(track => [track.packets, track.maximumPtsErrorUs, track.maximumComparableDtsErrorUs]), [[288, 0, 0], [564, 333, 333]]);
    assert.equal(v.serializedTimeline.tracks.find(track => track.kind === "soun").edits[0].mediaTimeTicks, "1024");
    assert.equal(v.aac.packetTimingAndTrim.initialSkipSamples, 1024);
    assert.equal(v.aac.outputPcm, v.aac.sourcePcm);
    assert.ok(v.fullDecode && v.candidateGate.passed && v.timingGate.passed);
    assert.equal(metrics.peakWasmMemoryBytes, 24 * 2 ** 20);
    assert.equal(metrics.maxReadChunkBytes, 262144);
    assert.ok(metrics.peakQueuedBytes <= 2 ** 20 && metrics.maxWriteChunkBytes <= 2 ** 20);
    assert.equal(metrics.peakPendingOperations, 1);
    assert.equal(metrics.scratchBytes, 0);
  }
  assert.equal(first.validation.outputSha256, recovered.validation.outputSha256);
  assert.equal(cancelled.state, "cancelled");
  assert.deepEqual(cancelled.cancellationBefore, { jobState: "running", outputBytes: 0, wasmResponseHeld: true });
  assert.equal(fault.state, "error");
  assert.equal(fault.metrics.outputBytes, 524288);
  assert.ok(cancelled.onlyEmptyPlaceholders && fault.onlyEmptyPlaceholders);
  assert.ok(arm.cases.every(row => row.outputRemoved));
  assert.ok(report.toolDownloadRemoved && report.fixtureRuntimeRemoved && arm.ownedRuntimeRemoved);
  assert.equal(arm.memory.validSamples, 134);
  assert.equal(arm.memory.unavailableSamples, 0);
  assert.equal(arm.memory.incrementalPrivateMiB, 125.61328125);
  assert.equal(arm.memory.cleanupAboveIdleMiB, 59.67578125);
  assert.ok(arm.birthCleanup.allObservedBirthsAbsent && arm.birthCleanup.noProcessesKilled);
  assert.equal(arm.birthCleanup.observedPidCount, 38);
  assert.equal(arm.birthCleanup.reused.length, 1);
  assert.equal(arm.serverCleanup.ownedRootAbsent, true);
  assert.deepEqual(report.originalBefore, report.originalAfter);
  assert.equal(report.originalMediaSelected, false);
  assert.equal(report.headed, false);
  assert.equal(report.publicAcceptance, false);
  assert.equal(report.speedGainProven, false);
  const archive = await read(arm.archive.file);
  assert.equal(sha(archive), arm.archive.sha256);
  assert.equal(sha(gunzipSync(archive, { maxOutputLength: 2 * 1024 ** 2 })), arm.archive.decodedSha256);
});
