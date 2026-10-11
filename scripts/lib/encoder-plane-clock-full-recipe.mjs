// Observer-only derivative of the exact title-qualified full-original driver.
// Never change codec settings, quality, memory formula, repeats or input.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { makeEncoderPlaneTitleFullCaller, makeEncoderPlaneTitleFullDriver,
  encoderPlaneTitleFullFiles, verifySingleIdleAbortQualification } from "./encoder-plane-title-full-recipe.mjs";
export { verifySingleIdleAbortQualification };
export const clockDiagnosticPath = "evidence/2026-10-11T03-45-24-030Z-native-receipt-clock-diagnostic.json";
export const previousClockFailurePath = "evidence/2026-10-11T00-18-32-419Z-encoder-plane-title-original-full-terminal.json";
const additions = ["scripts/run-encoder-plane-clock-original-full.mjs", "scripts/lib/encoder-plane-clock-full-recipe.mjs",
  "scripts/lib/clock-fenced-native-failure-observer.mjs", "scripts/lib/native-receipt-clock-fence.mjs",
  "scripts/validate-native-receipt-clock.mjs", "tests/native-receipt-clock-fence.test.mjs",
  "tests/mpeg2-encoder-plane-clock-full.test.mjs", clockDiagnosticPath, previousClockFailurePath];
export const encoderPlaneClockFullFiles = [...encoderPlaneTitleFullFiles, ...additions];
const uri = (root, file) => JSON.stringify(pathToFileURL(path.join(root, file)).href);
function exact(source, edits) {
  let generated = source;
  for (const [before, after] of edits) {
    assert.equal(generated.split(before).length - 1, 1, before);
    generated = generated.replace(before, after);
  }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "Only clock fence, reliable observer stop, ownership and evidence identities");
  return { generated, generatedSha256: sha(generated), edits };
}
export function verifyClockDiagnostic(proof) {
  assert.equal(proof.status, "actual-native-receipt-clock-and-owned-close-passed-not-browser-acceptance");
  assert.equal(proof.failure, null); assert.equal(proof.targetType, "owned-Node-process-tree-not-Chromium");
  assert.equal(proof.native.error, null); assert.ok(proof.native.sequence >= 5);
  assert.equal(proof.observerAbsent.status, "owned-identity-absent");
  assert.deepEqual(proof.observerAbsent.identity, proof.observerIdentity);
  assert.equal(proof.runtimeAbsent, true);
  assert.equal(proof.fence.monitorClosed, true);
  assert.equal(proof.fence.samplesDropped, 0); assert.equal(proof.fence.timestampsRewritten, 0);
  assert.equal(proof.fence.originalTimestampAssertionsUnchanged, true);
  assert.equal(proof.fence.fenceFailure, null); assert.equal(proof.fence.failedBatch, null);
  assert.deepEqual(proof.fence.limits, { maximumWaitMs: 1000, waitIntervalMs: 1, receiptMarginMs: 1, maximumSamples: 256 });
  for (const field of ["protectedInputOpened", "nativeConversionPerformed", "completeChromiumMemoryAcceptance", "publicAcceptance"])
    assert.equal(proof[field], false);
  assert.equal(proof.browsersLaunched, 0); assert.equal(proof.genuineConversions, 0);
  assert.ok(Object.keys(proof.sourcePins).length >= 8);
  // Qualification is OS helper integration only; it cannot turn into acceptance.
  return { nativeObserverIntegrationOnly: true, browserAcceptance: false };
}
export function makeEncoderPlaneClockFullDriver(previous, root, runtime, branch) {
  const old = makeEncoderPlaneTitleFullDriver(previous, root, runtime, branch);
  const edits = [
    [`import { startNativeBudgetFailureObserver } from ${uri(root, "scripts/lib/native-budget-failure-observer.mjs")};`,
      `import { startClockFencedNativeBudgetFailureObserver as startNativeBudgetFailureObserver, stopNativeObserverEvenAfterPhaseFailure } from ${uri(root, "scripts/lib/clock-fenced-native-failure-observer.mjs")};`],
    ['const sourceFiles = [', 'const sourceFiles = [' + additions.map(file => JSON.stringify(file) + ',').join('')],
    ['  const debugPort = await waitFor(', '  await recordLaunch(observer, "native-memory-observer");\n  const debugPort = await waitFor('],
    ['try { observer.setPhase("finally-cleanup"); await observer.stop(); cleanup.observerStopped = true; }\n      finally { nativeMemory = observer.report(); nativeFailureCapture = observer.failureCaptureReport(); }',
      'try { await stopNativeObserverEvenAfterPhaseFailure(observer); }\n      finally { nativeMemory = observer.report(); nativeFailureCapture = observer.failureCaptureReport();\n        cleanup.observerStopped = nativeMemory.receiptClockFence.monitorClosed === true; }'],
    ['-private-mpeg2-encoder-plane-title-full-native-100ms', '-private-mpeg2-encoder-plane-clock-full-native-100ms'],
    ['"mpeg2-encoder-plane-title-full-runtime-"', '"mpeg2-encoder-plane-clock-full-runtime-"'],
  ];
  return { ...old, ...exact(old.generated, edits), previousTitleDriverSha256: sha(old.generated),
    titleDriverEdits: old.edits, clockFenceAndObserverCloseOnly: true, publicAcceptance: false };
}
export function makeEncoderPlaneClockFullCaller(source, root) {
  const old = makeEncoderPlaneTitleFullCaller(source, root);
  const oldImport = `import { makeEncoderPlaneTitleFullDriver as makeSingleIdleFullDriver, verifySingleIdleAbortQualification, encoderPlaneTitleFullFiles as singleIdleFullFiles } from ${uri(root, "scripts/lib/encoder-plane-title-full-recipe.mjs")};`;
  const guard = `
const clockProof = JSON.parse(await read(${JSON.stringify(clockDiagnosticPath)})); verifyClockDiagnostic(clockProof);
for (const [file, hash] of Object.entries(clockProof.sourcePins)) assert.equal(sha(await read(file)), hash, file);
await assert.rejects(access(clockProof.runtime), { code: "ENOENT" });
const clockFailed = JSON.parse(await read(${JSON.stringify(previousClockFailurePath)}));
assert.equal(clockFailed.status, "failed-or-incomplete"); assert.equal(clockFailed.executions, 1);
assert.equal(clockFailed.candidate.status, "failed"); assert.equal(clockFailed.candidate.completedConversions, 0);
assert.ok(clockFailed.candidate.failure.message.includes("assert.ok(observedAt >= at)"));
assert.equal(clockFailed.wrapperAbsent, true); assert.equal(clockFailed.productionRestored, true);
assert.deepEqual(clockFailed.sourcePins, clockFailed.postSourcePins);
for (const [file, hash] of Object.entries(clockFailed.sourcePins)) assert.equal(sha(await read(file)), hash, file);
const failedArchive = clockFailed.candidate.compressedReport, failedGzip = await read(failedArchive.path);
assert.equal(failedGzip.length, failedArchive.bytes); assert.equal(sha(failedGzip), failedArchive.sha256);
const failedRawBytes = gunzipSync(failedGzip, { maxOutputLength: 33554432 });
assert.equal(failedRawBytes.length, failedArchive.restoredBytes); assert.equal(sha(failedRawBytes), failedArchive.restoredSha256);
const failedRaw = JSON.parse(failedRawBytes);
assert.equal(failedRaw.nativeMemory.error, clockFailed.candidate.failure.message);
assert.equal(failedRaw.cleanup.observerStopped, false); assert.ok(failedRaw.cleanup.errors.length > 0);
await assert.rejects(access(failedRaw.runtimeDirectory), { code: "ENOENT" });
// Historical invalid native coverage stays failed; this is a different observer.
`;
  const edits = [
    [oldImport, `import { makeEncoderPlaneClockFullDriver as makeSingleIdleFullDriver, verifySingleIdleAbortQualification, encoderPlaneClockFullFiles as singleIdleFullFiles, verifyClockDiagnostic } from ${uri(root, "scripts/lib/encoder-plane-clock-full-recipe.mjs")};`],
    ['const hashFile = async file =>', guard + '\nconst hashFile = async file =>'],
    ['// No stale-state restart: check actual old launch identities; do not kill anything.',
      '// No stale-state restart: check actual old launch identities; do not kill anything.\n    for (const row of clockFailed.candidate.ownedLaunches) assert.equal((await observeOwnedProcessExit(row.identity)).status, "owned-identity-absent");\n    assert.equal((await observeOwnedProcessExit(clockFailed.driverIdentity)).status, "owned-identity-absent");\n    assert.equal((await observeOwnedProcessExit(clockProof.observerIdentity)).status, "owned-identity-absent");'],
    ['name.endsWith("-encoder-plane-title-full-live.json")', '(name.endsWith("-encoder-plane-title-full-live.json") || name.endsWith("-encoder-plane-clock-full-live.json"))'],
    ['"encoder-plane-title-full-wrapper-"', '"encoder-plane-clock-full-wrapper-"'],
    ['-encoder-plane-title-full-post-cancel-partial-blink.json.gz', '-encoder-plane-clock-full-post-cancel-partial-blink.json.gz'],
    ['-encoder-plane-title-full-executed-sources.json.gz', '-encoder-plane-clock-full-executed-sources.json.gz'],
    ['-encoder-plane-title-full-live.json`', '-encoder-plane-clock-full-live.json`'],
    ['-private-mpeg2-encoder-plane-title-full-native-100ms.json', '-private-mpeg2-encoder-plane-clock-full-native-100ms.json'],
    ['-encoder-plane-title-full-raw.json.gz', '-encoder-plane-clock-full-raw.json.gz'],
    ['-encoder-plane-title-original-full${', '-encoder-plane-clock-original-full${'],
  ];
  return { ...old, ...exact(old.generated, edits), previousTitleCallerSha256: sha(old.generated),
    titleCallerEdits: old.edits, clockFenceAndObserverCloseOnly: true };
}
