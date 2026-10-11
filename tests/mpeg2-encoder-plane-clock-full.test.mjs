import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeEncoderPlaneTitleFullCaller, makeEncoderPlaneTitleFullDriver } from "../scripts/lib/encoder-plane-title-full-recipe.mjs";
import { makeEncoderPlaneClockFullCaller, makeEncoderPlaneClockFullDriver, encoderPlaneClockFullFiles,
  verifyClockDiagnostic, clockDiagnosticPath, previousClockFailurePath } from "../scripts/lib/encoder-plane-clock-full-recipe.mjs";
import { deriveDriverSourcePinFiles } from "../scripts/lib/driver-source-pin-union.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const receipt = JSON.parse(await read(previousClockFailurePath));
async function restore(record) {
  const compressed = await read(record.path); assert.equal(sha(compressed), record.sha256);
  assert.equal(compressed.length, record.bytes);
  const bytes = gunzipSync(compressed, { maxOutputLength: 8388608 });
  assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
  return JSON.parse(bytes);
}
const parent = JSON.parse(await read(receipt.previousTerminal.path)), previous = await restore(parent.sourceArchive);
const actual = await restore(receipt.sourceArchive);
const branch = JSON.parse(await read("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"));
const build = JSON.parse(await read("evidence/mpeg2-encoder-plane-build-38044000567.json"));
const input = (await read("scripts/run-single-idle-original-full.mjs")).toString();
const diagnostic = JSON.parse(await read(clockDiagnosticPath));
const reverse = recipe => recipe.edits.toReversed().reduce((text, [before, after]) => text.replace(after, before), recipe.generated);
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
}
test("observer derivative reverses to the exact failed title driver; all conversion and full acceptance gates remain", () => {
  assert.equal(makeEncoderPlaneTitleFullDriver(previous, root, receipt.wrapper, branch).generated, actual.generated);
  const recipe = makeEncoderPlaneClockFullDriver(previous, root, receipt.wrapper, branch);
  assert.equal(reverse(recipe), actual.generated); syntax(recipe.generated);
  for (const token of ['number <= 3', 'run.incrementalPrivateMiB <= 250', 'assert.ok(ssim >= 0.98)',
    'maximumTimestampErrorSeconds <= 0.001', 'expectedSourceBytes = 2958573265', 'minimumMs: 300000',
    '"maximumConversionMs":21600000', '"partialOutputStopEnabled":false', '"--headless=new"',
    'metrics.peakPendingOperations <= 1', 'run.independentPreAssertionProbe = after;', 'run.exactVideoTitleMapping',
    'run.exactAudioTitleMappings', 'await stopNativeObserverEvenAfterPhaseFailure(observer)',
    'await recordLaunch(observer, "native-memory-observer")', 'cleanupErrors.push(JSON.stringify(describeOwnedCleanupError(error)))'])
    assert.ok(recipe.generated.includes(token), token);
  assert.ok(!recipe.generated.includes('observer.setPhase("finally-cleanup"); await observer.stop();'));
  const coverage = deriveDriverSourcePinFiles(recipe.generated, [...new Set([...Object.keys(parent.sourcePins),
    ...encoderPlaneClockFullFiles, "scripts/lib/encoder-plane-build-workflow.mjs", branch.workflow.path])]);
  const files = [...new Set([...coverage.files, ...Object.keys(build.manifest.sources)])];
  for (const file of [...Object.keys(receipt.sourcePins), ...encoderPlaneClockFullFiles]) assert.ok(files.includes(file), file);
  assert.ok(files.length <= 256); assert.equal(files.length, 249);
});
test("qualified caller retains original restoration, failure, three-run, disk and source guards", () => {
  assert.equal(makeEncoderPlaneTitleFullCaller(input, root).generated, actual.generatedCaller);
  const recipe = makeEncoderPlaneClockFullCaller(input, root); assert.equal(reverse(recipe), actual.generatedCaller);
  syntax(recipe.generated);
  for (const token of ['verifyClockDiagnostic(clockProof)', 'Object.entries(clockFailed.sourcePins)',
    'sha(failedRawBytes), failedArchive.restoredSha256', 'observeOwnedProcessExit(clockFailed.driverIdentity)',
    'name.endsWith("-encoder-plane-clock-full-live.json")', 'assert.ok(!raw.cleanup.errors?.length)',
    'proof.candidate.completedConversions, 3', 'proof.diskPreflightBytes >= 32 * 1024 ** 3', 'await runtime.close()'])
    assert.ok(recipe.generated.includes(token), token);
  assert.throws(() => makeEncoderPlaneClockFullCaller(input + "\n", root));
});
test("actual Node diagnostic remains integration only and every prerequisite is source-bound", async () => {
  assert.deepEqual(verifyClockDiagnostic(diagnostic), { nativeObserverIntegrationOnly: true, browserAcceptance: false });
  for (const [file, expected] of Object.entries(diagnostic.sourcePins)) assert.equal(sha(await read(file)), expected, file);
  for (const [file, expected] of Object.entries(receipt.sourcePins)) assert.equal(sha(await read(file)), expected, file);
  assert.equal(diagnostic.fence.waitedBatches, 0, "Actual catch-up not exercised; do not claim otherwise");
  for (const mutate of [proof => { proof.native.error = "observer failed"; }, proof => { proof.publicAcceptance = true; },
    proof => { proof.targetType = "Chromium"; }, proof => { proof.fence.timestampsRewritten = 1; },
    proof => { proof.fence.monitorClosed = false; }, proof => { proof.runtimeAbsent = false; },
    proof => { proof.fence.limits.maximumWaitMs = 1001; }]) {
    const bad = structuredClone(diagnostic); mutate(bad); assert.throws(() => verifyClockDiagnostic(bad));
  }
});
