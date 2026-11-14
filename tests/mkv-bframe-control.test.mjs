import assert from "node:assert/strict";
import test from "node:test";
import { readFile, lstat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { bframeMkvFixture } from "../scripts/lib/mkv-complex-fidelity.mjs";
import { summarizeProtectedWindow } from "../scripts/lib/mkv-protected-repeat-contract.mjs";
import { reconcileChromiumBirths } from "../scripts/lib/reconcile-chromium-births.mjs";

const read = file => readFile(new URL(`../${file}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");

test("Reusable B-frame source and descriptor are pinned, not a renamed output or an original-file replacement", async () => {
  const file = new URL(`../${bframeMkvFixture.file}`, import.meta.url), h = createHash("sha256");
  for await (const b of createReadStream(file, { highWaterMark: 262144 })) h.update(b);
  assert.equal(h.digest("hex"), bframeMkvFixture.sha256);
  assert.equal((await lstat(file)).size, bframeMkvFixture.bytes);
  const descriptor = JSON.parse(await read(bframeMkvFixture.file + ".json"));
  assert.equal(descriptor.status, "reusable-bitexact-source-generated-twice-identically");
  assert.equal(descriptor.sha256, bframeMkvFixture.sha256);
  assert.equal(descriptor.bytes, bframeMkvFixture.bytes);
  assert.equal(descriptor.nativeToolUsedOnlyForFixtureGenerationAndInspection, true);
  assert.equal(descriptor.hasBFrames, 2);
  assert.deepEqual(descriptor.packetCounts, [72, 189, 189]);
  assert.deepEqual(descriptor.sourceCadenceMs, [41, 42, 83, 84]);
  assert.equal(descriptor.missingSourceDts, 2);
  assert.equal(descriptor.sourceFirstDts, null);
});

test("Real probe-core B-frame receipt is safe refusal, not successful conversion or fidelity acceptance", async () => {
  const bytes = await read("evidence/2026-11-14T23-11-45-586Z-mkv-probe-decoder-bframes.json");
  assert.equal(sha(bytes), "36d1619ee1b71b62c141ddcb83dc0d7d577f01d0ef8e37c446824df232ae8c6a");
  const report = JSON.parse(bytes), [arm] = report.arms, [row] = arm.cases;
  assert.equal(report.status, "failed-not-acceptance");
  assert.equal(report.h264BFrameControl, true); assert.equal(report.h264ProbeDecoderCandidate, true);
  assert.equal(report.candidateBuild.build.artifacts["within-direct.wasm"].sha256,
    "3d08c462c2075da150386de99b1408cfc72e0d2f21436c40153b95a6ff3148fc");
  assert.deepEqual([report.fixture.bytes, report.fixture.sha256], [bframeMkvFixture.bytes, bframeMkvFixture.sha256]);
  assert.equal(report.fixture.sourceProbe.streams[0].has_b_frames, 2);
  assert.equal(report.fixture.bframeSource.unavailableSourceVideoDts, 2);
  assert.equal(arm.cases.length, 1, "Stop after the initial failure; do not replay recovery jobs as if it passed");
  assert.equal(row.state, "error"); assert.equal(row.phase, "Stopped safely");
  assert.match(row.error, /H\.264 stream copy cannot preserve unverified or non-monotonic decode timestamps/);
  assert.equal(row.metrics.outputBytes, 0); assert.equal(row.metrics.peakPendingOperations, 0);
  assert.equal(row.metrics.peakQueuedBytes, 0); assert.equal(row.metrics.maxReadChunkBytes, 262144);
  assert.equal(row.metrics.peakWasmMemoryBytes, 24 * 1048576);
  assert.ok(row.selection.productionInputElementUsed && row.selection.fileMetadataUnchanged);
  const packed = await read(arm.archive.file); assert.equal(sha(packed), arm.archive.sha256);
  const raw = gunzipSync(packed, { maxOutputLength: 2 * 1024 ** 2 }); assert.equal(sha(raw), arm.archive.decodedSha256);
  const samples = JSON.parse(raw), memory = summarizeProtectedWindow(samples, arm.memory, arm.blank.privateBytes);
  assert.equal(memory.incrementalPrivateMiB, 93.7421875);
  assert.equal(memory.validSamples, 6); assert.equal(memory.unavailableSamples, 0);
  assert.equal(memory.cleanupAboveIdleMiB, null, "No stable success cleanup result was acquired");
  assert.deepEqual(reconcileChromiumBirths({ identity: arm.identity, observedPids: arm.browserCleanup.observedPids,
    samples, current: arm.browserCleanup.observations.at(-1).current }), arm.birthCleanup);
  assert.equal(arm.birthCleanup.allObservedBirthsAbsent, true); assert.equal(arm.birthCleanup.observedPidCount, 40);
  assert.equal(arm.birthCleanup.reused.length, 1); assert.equal(arm.birthCleanup.noProcessesKilled, true);
  assert.ok(arm.ownedRuntimeRemoved && arm.serverCleanup.ownedRootAbsent && report.fixtureRuntimeRemoved && report.toolDownloadRemoved);
  assert.deepEqual(report.originalBefore, report.originalAfter);
  assert.equal(report.nativeConversionUsed, false); assert.equal(report.publicAcceptance, false);
  assert.equal(report.productionFilesReplaced, false); assert.equal(report.originalMediaSelected, false);
});
