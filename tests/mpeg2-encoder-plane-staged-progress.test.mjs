import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { recordOutputWorkCheckpoint } from "../scripts/lib/split-copy-work-checkpoints.mjs";
import { MP4_DESTINATION_COPY_PHASE, recordStagedOutputWorkCheckpoint } from "../scripts/lib/staged-output-work-checkpoints.mjs";
import { makeEncoderPlaneFullDriver, makeEncoderPlaneFullCaller } from "../scripts/lib/encoder-plane-full-recipe.mjs";
import { makeEncoderPlaneStagedFullDriver, makeEncoderPlaneStagedFullCaller, encoderPlaneStagedFullFiles } from "../scripts/lib/encoder-plane-staged-full-recipe.mjs";
import { deriveDriverSourcePinFiles } from "../scripts/lib/driver-source-pin-union.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const receipt = JSON.parse(await read("evidence/2026-10-10T13-32-15-738Z-encoder-plane-original-full-terminal.json"));
const restore = async record => {
  const bytes = await read(record.path); assert.equal(bytes.length, record.bytes); assert.equal(sha(bytes), record.sha256);
  const raw = gunzipSync(bytes, { maxOutputLength: 33554432 });
  assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256); return JSON.parse(raw);
};
const raw = await restore(receipt.candidate.compressedReport);
const archive = await restore(receipt.sourceArchive);
const state = () => ({ workCheckpoints: [], lastProgressObservation: null, unavailableProgressSamples: 0 });
const copySample = (outputBytes = 10, elapsedMs = 100) => ({ jobState: "running", phase: MP4_DESTINATION_COPY_PHASE,
  selectedProfileId: "mkv-to-mp4", metrics: { inputBytes: 100, outputBytes, elapsedMs, scratchBytes: 1000,
    maxWriteChunkBytes: 524288, maxScratchReadChunkBytes: 524288, maxScratchWriteChunkBytes: 524288,
    peakQueuedBytes: 524288, peakPendingOperations: 1 } });
const reverse = recipe => recipe.edits.toReversed().reduce((s, [before, after]) => s.replaceAll(after, before), recipe.generated);
const syntax = generated => {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: generated, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
};
test("Actual archived final-copy transition reproduces old failure, corrected observation keeps all early encoding windows exact", () => {
  assert.equal(raw.failure.message, "Reject reset/nonmonotonic work counters");
  assert.equal(raw.runs[0].state.phase, MP4_DESTINATION_COPY_PHASE);
  assert.equal(raw.runs[0].independentValidation, null);
  const old = state(), fixed = state(); let reproduced = 0;
  // The ring has evicted early samples, but exact before/after checkpoint
  // brackets are retained separately. Replay those real scalars, not invented
  // intervening samples or the late ring as if it contained the entire run.
  assert.ok(raw.samplesEvicted > 0);
  const early = raw.progressProbe.workCheckpoints.flatMap(row => [row.before, row.after]);
  for (const metrics of early) {
    assert.ok(metrics);
    const s = { jobState: "running", metrics };
    recordOutputWorkCheckpoint(old, s); recordStagedOutputWorkCheckpoint(fixed, s);
  }
  const samples = raw.samples.filter(row => row.phase === "conversion-1");
  assert.deepEqual(samples.at(-1).metrics, raw.runs[0].state.metrics);
  for (const [index, sample] of samples.entries()) {
    const s = { jobState: sample.jobState, phase: index === samples.length - 1 ? raw.runs[0].state.phase : undefined,
      selectedProfileId: "mkv-to-mp4", metrics: sample.metrics };
    try { recordOutputWorkCheckpoint(old, s); } catch (error) { assert.match(error.message, /nonmonotonic/); reproduced++; }
    recordStagedOutputWorkCheckpoint(fixed, s);
  }
  assert.equal(reproduced, 1);
  assert.deepEqual(fixed.workCheckpoints, raw.progressProbe.workCheckpoints);
  assert.deepEqual(fixed.lastProgressObservation, raw.progressProbe.lastProgressObservation);
  assert.equal(fixed.finalDestinationCopyObservation.stagedBytes, 3337164038);
  assert.equal(fixed.finalDestinationCopyObservation.last.outputBytes, 157286400);
  assert.equal(fixed.finalDestinationCopyObservation.last.elapsedMs, raw.runs[0].state.metrics.elapsedMs);
  assert.equal(raw.status, "failed"); // A replay cannot retroactively pass the conversion.
});
test("Copy-start progress before first read does not fabricate optional scratch metrics or acceptance", () => {
  const p = state(), s = copySample(0);
  delete s.metrics.maxScratchReadChunkBytes; delete s.metrics.maxScratchWriteChunkBytes;
  recordStagedOutputWorkCheckpoint(p, s);
  assert.equal(p.finalDestinationCopyObservation.last.outputBytes, 0);
  assert.equal(s.metrics.maxScratchReadChunkBytes, undefined);
  recordStagedOutputWorkCheckpoint(p, copySample(10, 110));
  assert.equal(p.finalDestinationCopyObservation.last.outputBytes, 10);
});
test("Stage-specific reset allowed only at measured copy phase; within-stage counters, fixed size and existing bounds stay strict", () => {
  const p = state();
  recordStagedOutputWorkCheckpoint(p, { jobState: "running", metrics: { inputBytes: 99, outputBytes: 800, elapsedMs: 90 } });
  recordStagedOutputWorkCheckpoint(p, copySample(10)); recordStagedOutputWorkCheckpoint(p, copySample(20, 110));
  const cases = [s => s.metrics.outputBytes = 5, s => s.metrics.scratchBytes = 2000,
    s => s.metrics.inputBytes = 101, s => s.metrics.elapsedMs = 80,
    s => s.metrics.outputBytes = 1001, s => s.metrics.maxWriteChunkBytes = 524289,
    s => s.metrics.maxScratchReadChunkBytes = 524289, s => s.metrics.maxScratchWriteChunkBytes = 524289,
    s => s.metrics.peakQueuedBytes = 524289, s => s.metrics.peakPendingOperations = 2,
    s => s.selectedProfileId = "mp4-to-avi", s => s.phase = "Encoding"];
  for (const mutate of cases) { const s = copySample(30, 120); mutate(s); assert.throws(() => recordStagedOutputWorkCheckpoint(structuredClone(p), s)); }
  recordStagedOutputWorkCheckpoint(p, { jobState: "complete", metrics: {} });
  assert.equal(p.finalDestinationCopyObservation.last.outputBytes, 20);
  assert.equal(p.lastProgressObservation.outputBytes, 800);
});
test("Missing copy sample remains unavailable; encoding regression and unknown phase are not silently reset", () => {
  const p = state(), invalid = copySample(); delete invalid.metrics.scratchBytes;
  recordStagedOutputWorkCheckpoint(p, invalid); assert.equal(p.unavailableProgressSamples, 1);
  assert.equal(p.finalDestinationCopyObservation, undefined);
  recordStagedOutputWorkCheckpoint(p, { jobState: "running", metrics: { inputBytes: 100, outputBytes: 800, elapsedMs: 90 } });
  const wrong = copySample(1); wrong.phase = "Some other phase";
  assert.throws(() => recordStagedOutputWorkCheckpoint(p, wrong), /nonmonotonic/);
  const backwards = copySample(); backwards.metrics.inputBytes = 99;
  assert.throws(() => recordStagedOutputWorkCheckpoint(p, backwards), /nonmonotonic/);
});
test("Additive driver/caller derivatives reverse exactly; no original fixture, quality, memory, repeat, validation or cleanup gate edits", async () => {
  const priorReceipt = JSON.parse(await read(receipt.previousTerminal.path));
  const previous = await restore(priorReceipt.sourceArchive);
  const branch = JSON.parse(await read("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"));
  const runtime = path.join(root, "work/STAGED-PROGRESS-UNIT-ONLY");
  const recipe = makeEncoderPlaneStagedFullDriver(previous, root, runtime, branch);
  const old = makeEncoderPlaneFullDriver(previous, root, runtime, branch);
  assert.equal(reverse(recipe), old.generated); syntax(recipe.generated);
  const input = (await read("scripts/run-single-idle-original-full.mjs")).toString();
  const caller = makeEncoderPlaneStagedFullCaller(input, root);
  assert.equal(reverse(caller), makeEncoderPlaneFullCaller(input, root).generated); syntax(caller.generated);
  for (const token of ['number <= 3', 'run.incrementalPrivateMiB <= 250', 'assert.ok(ssim >= 0.98)',
    'maximumTimestampErrorSeconds <= 0.001', 'minimumMs: 300000', 'expectedSourceBytes = 2958573265',
    '"maximumConversionMs":21600000', '"partialOutputStopEnabled":false', 'await verifySource(); cleanup.protectedFixtureUnchanged = true',
    'metrics.peakPendingOperations <= 1', '"--headless=new"']) {
    assert.ok(recipe.generated.includes(token), token);
  }
  assert.ok(!recipe.generated.includes('windowsHide: false'));
  assert.ok(caller.generated.includes('name.endsWith("-encoder-plane-staged-full-live.json")'));
  const union = deriveDriverSourcePinFiles(recipe.generated, [...Object.keys(priorReceipt.sourcePins), ...encoderPlaneStagedFullFiles]);
  for (const file of encoderPlaneStagedFullFiles) assert.ok(union.files.includes(file), file);
  assert.equal(sha(archive.generated), receipt.sourceArchive.driverSha256);
  assert.throws(() => makeEncoderPlaneStagedFullCaller(input + "\n", root));
});
