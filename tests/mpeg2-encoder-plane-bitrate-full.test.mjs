import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeLateAllocatorAbortAdapter } from "../scripts/lib/mpeg2-late-allocator-abort-adapter.mjs";
import { makeEncoderPlaneAbortStager } from "../scripts/lib/encoder-plane-full-recipe.mjs";
import { makeEncoderPlaneClockFullCaller, makeEncoderPlaneClockFullDriver } from "../scripts/lib/encoder-plane-clock-full-recipe.mjs";
import { makeFullBitrateAbortAdapter, makeEncoderPlaneBitrateAbortStager, makeEncoderPlaneBitrateFullCaller,
  makeEncoderPlaneBitrateFullDriver, validateFullBitrateAudit, verifyBitrateFullPrerequisites,
  bitrateFullAdditions } from "../scripts/lib/encoder-plane-bitrate-full-recipe.mjs";
import { makeEncoderPlaneBitrateBrowserRecipe } from "../scripts/lib/encoder-plane-bitrate-browser-recipe.mjs";
import { FROZEN_BROWSER_SOURCES } from "../scripts/lib/single-idle-browser-recipe.mjs";
import { deriveDriverSourcePinFiles } from "../scripts/lib/driver-source-pin-union.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const json = async file => JSON.parse(await read(file));
async function restore(record) {
  const zipped = await read(record.path); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: 33554432 });
  assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256); return JSON.parse(bytes);
}
const receipt = await json("evidence/2026-10-11T03-53-11-041Z-encoder-plane-clock-original-full-terminal.json");
const previous = await restore((await json(receipt.previousTerminal.path)).sourceArchive);
const branch = await json("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json");
const build = await json("evidence/mpeg2-encoder-plane-build-38044000567.json");
const sources = {}; for (const file of Object.keys(FROZEN_BROWSER_SOURCES)) sources[file] = (await read(file)).toString();
const originalAdapter = makeLateAllocatorAbortAdapter({ stager: sources["scripts/stage-mpeg2-split-direct.mjs"],
  stackHelper: (await read("scripts/lib/bounded-wasm-abort-capture.mjs")).toString(),
  snapshotHelper: (await read("scripts/lib/late-refstruct-abort-snapshot.mjs")).toString(),
  poolHelper: (await read("scripts/lib/late-pool-abort-capture.mjs")).toString(),
  allocatorHelper: (await read("scripts/lib/late-pool-allocator-abort-capture.mjs")).toString(),
  freeHeaderHelper: (await read("scripts/lib/dlmalloc-free-header-inspection.mjs")).toString(),
  controlProof: await json("evidence/late-pool-abort-control-2026-10-08.json"),
  allocatorControlProof: await json("evidence/late-pool-allocator-abort-control-2026-10-08.json"),
  layoutProof: await json("evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json") }).adapter;
const adapter = makeFullBitrateAbortAdapter(originalAdapter);
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
}
function reverse(recipe, original) {
  let value = recipe.generated;
  for (const [before, after] of recipe.edits.toReversed()) value = value.replaceAll(after, before);
  assert.equal(value, original); syntax(recipe.generated);
}
test("full adapter uses EXACTLY the two short-qualified bitrate/audit edits, preserving all fatal observers", () => {
  const short = makeEncoderPlaneBitrateBrowserRecipe(sources, root, path.join(root, "work/UNIT-ONLY"), "2026-10-11T00-00-00-000Z", branch, build, 4000000);
  assert.deepEqual(adapter.edits, short.stageEdits); reverse(adapter, originalAdapter);
  assert.equal(adapter.publicAcceptance, false); assert.equal(adapter.nativeBitRate, 4000000);
  assert.ok(adapter.adapterBytes < 32768); assert.throws(() => makeFullBitrateAbortAdapter(originalAdapter + "\n"));
});
test("stager retains native qualification, original observer hash gate and exact owned restore", async () => {
  const source = (await read("scripts/stage-mpeg2-single-idle-abort.mjs")).toString();
  const next = makeEncoderPlaneBitrateAbortStager(source, root), old = makeEncoderPlaneAbortStager(source, root);
  reverse(next, old.generated);
  assert.ok(next.generated.includes('assert.equal(Buffer.byteLength(originalAdapter), 18330)'));
  assert.ok(next.generated.includes('makeFullBitrateAbortAdapter(originalAdapter)'));
  assert.ok(next.generated.includes('finally { await runtime.close(); }'));
});
test("full driver reverses all edits and preserves three whole-input six-hour250MiB0.98 fidelity gates", () => {
  const old = makeEncoderPlaneClockFullDriver(previous, root, receipt.wrapper, branch);
  const next = makeEncoderPlaneBitrateFullDriver(previous, root, receipt.wrapper, branch, adapter);
  reverse(next, old.generated);
  for (const token of ['number <= 3', 'run.incrementalPrivateMiB <= 250', 'maximumTimestampErrorSeconds <= 0.001',
    'minimumMs: 300000', 'metrics.peakPendingOperations <= 1', 'metrics.peakQueuedBytes <= 1048576',
    'await stopNativeObserverEvenAfterPhaseFailure(observer)', 'expectedSourceBytes = 2958573265', '"maximumConversionMs":21600000',
    'assert.ok(ssim >= 0.98)', 'const diagnosticOnly = false', 'assert.ok(Buffer.byteLength(json) <= 32 * MiB'])
    assert.ok(next.generated.includes(token), token);
  assert.ok(next.generated.indexOf('run.independentSsimDiagnostic = inspectSsimSummary(stderr)') < next.generated.indexOf('assert.ok(ssim >= 0.98)'));
  assert.ok(next.generated.includes('run.nativeBitrateConfiguration = bitrateAuditSamples[number - 1] ?? null'));
  const discovered = deriveDriverSourcePinFiles(next.generated, []);
  const files = [...new Set([...discovered.files, ...Object.keys(receipt.sourcePins)])];
  assert.equal(files.length, 256); assert.equal(bitrateFullAdditions.length, 7);
  for (const file of Object.keys(receipt.sourcePins)) assert.ok(files.includes(file));
  assert.equal(next.fullOriginalAcceptance, false); assert.equal(next.conversionSpeedAcceptance, false);
});
test("caller preserves disk/RAM/preimages/archive/owned-birth/whole-three-run collector gates", async () => {
  const source = (await read("scripts/run-single-idle-original-full.mjs")).toString();
  const next = makeEncoderPlaneBitrateFullCaller(source, root), old = makeEncoderPlaneClockFullCaller(source, root);
  reverse(next, old.generated);
  for (const token of ['files.length <= 256', 'sourceBytes.length <= 8388608', 'rawBytes.length <= 33554432',
    'proof.diskPreflightBytes >= 32 * 1024 ** 3', 'proof.launchHostPreflight.safeToStart, true',
    'verifyBitrateFullPrerequisites(root)', 'observeOwnedProcessExit(identity)', 'proof.candidate.completedConversions, 3',
    'raw.progressProbe.maximumConversionMs, 21600000', 'raw.progressProbe.partialOutputStopEnabled, false',
    'for (const [file, hash] of Object.entries(raw.sourceHashes)) assert.equal(hash, pins[file], file)',
    'assert.deepEqual(proof.postSourcePins, pins)', 'never restart']) assert.ok(next.generated.includes(token), token);
  assert.throws(() => makeEncoderPlaneBitrateFullCaller(source + "\n", root));
});
test("missing native-open telemetry, changed geometry/FPS/quality/bitrate/reserved words cannot pass", async () => {
  const proof = await json("evidence/2026-10-11T07-36-13-517Z-encoder-plane-bitrate-4000000-diagnostic.json");
  assert.deepEqual(validateFullBitrateAudit(proof.analysis.nativeConfiguration), proof.analysis.nativeConfiguration);
  assert.throws(() => validateFullBitrateAudit(null));
  for (const index of [1, 2, 4, 5, 6, 8, 9, 10, 12, 18, 23]) {
    const wrong = structuredClone(proof.analysis.nativeConfiguration); wrong.words[index]++;
    assert.throws(() => validateFullBitrateAudit(wrong));
  }
});
test("all short/recovery/current-source/archive/prior failed full prerequisites reverify without launching browsers", async () => {
  const proof = await verifyBitrateFullPrerequisites(root);
  assert.deepEqual(proof.measuredPrerequisiteSourceCounts, [78, 78, 79]);
  assert.equal(proof.unchangedHistoricalFullSources, 249); assert.ok(proof.ownedIdentities.length >= 10);
  assert.equal(proof.fullOriginalAcceptance, false); assert.equal(proof.publicAcceptance, false);
});
test("existing bounded histories fit terminal report cap with three simulated run summaries (not browser evidence)", async () => {
  const raw = await restore(receipt.candidate.compressedReport);
  raw.runs = [1, 2, 3].map(number => ({ ...structuredClone(raw.runs[0]), number }));
  raw.nativeMemory.phases = [0, 1, 2].flatMap(() => structuredClone(raw.nativeMemory.phases));
  raw.splitFinalSamples = [0, 1, 2].map(() => structuredClone(raw.splitFinalSamples[0]));
  raw.bitrateAuditSamples = [0, 1, 2].map(() => ({ words: Array(24).fill(1) }));
  assert.ok(Buffer.byteLength(JSON.stringify(raw, null, 2)) < 33554432);
});
