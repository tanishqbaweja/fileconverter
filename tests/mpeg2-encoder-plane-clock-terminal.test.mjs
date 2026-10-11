import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeTitleFullTerminalAnalyzer } from "../scripts/lib/encoder-plane-title-terminal-recipe.mjs";
import { encoderPlaneClockTerminalFacts } from "../scripts/lib/encoder-plane-clock-terminal-facts.mjs";
import { makeClockFullTerminalAnalyzer, makeSsimCapturingClockFullDriver } from "../scripts/lib/encoder-plane-clock-terminal-recipe.mjs";
import { makeEncoderPlaneClockFullDriver } from "../scripts/lib/encoder-plane-clock-full-recipe.mjs";
import { deriveDriverSourcePinFiles } from "../scripts/lib/driver-source-pin-union.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const receipt = JSON.parse(await read("evidence/2026-10-11T03-53-11-041Z-encoder-plane-clock-original-full-terminal.json"));
async function restore(record, limit) {
  const zipped = await read(record.path); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: limit }); assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
  return JSON.parse(bytes);
}
const raw = await restore(receipt.candidate.compressedReport, 33554432);
const executed = await restore(receipt.sourceArchive, 8388608);
const previousReceipt = JSON.parse(await read(receipt.previousTerminal.path)), previous = await restore(previousReceipt.sourceArchive, 8388608);
const branch = JSON.parse(await read("evidence/mpeg2-encoder-plane-prototype-build-branch-2026-10-10.json"));
const analyzer = (await read("scripts/analyze-encoder-plane-full-terminal.mjs")).toString();
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
}
test("clock audit reverses to unchanged strict title/archive/current-source/quality/cleanup audit", () => {
  const recipe = makeClockFullTerminalAnalyzer(analyzer, root);
  const old = makeTitleFullTerminalAnalyzer(analyzer, root);
  let reversed = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, old.generated); syntax(recipe.generated);
  for (const token of ["assert.equal(executed.generated, expected.generated)", "executed.generatedCaller, caller.generated", "Actual owned birth identity is still alive",
    "fullProtectedPostSha256Verified", "assert.ok(!raw.cleanup.errors?.length)", "encoder-plane-clock-full-recipe.mjs", "encoder-plane-clock-terminal-facts.mjs"])
    assert.ok(recipe.generated.includes(token), token);
  assert.throws(() => makeClockFullTerminalAnalyzer(analyzer + "\n", root));
});
test("actual full output and221.738MiB window remain zero validated outputs despite a healthy complete observer", () => {
  const facts = encoderPlaneClockTerminalFacts(raw);
  assert.equal(facts.native.observedIncrementalPrivateMiB, 221.73828125);
  assert.equal(facts.rowsCountedWithoutDropping, 96328); assert.equal(facts.evaluatedConversionSamples, 75771);
  assert.equal(facts.actualWaitedBatches, 50); assert.equal(facts.completedConversions, 0);
  assert.equal(facts.fullOriginalSessionGatePassed, false); assert.equal(facts.historicalDeletedOutputNumericSsimKnown, false);
  assert.equal(facts.savedButNotValidated[0].outputBytes, 3337164038); assert.equal(facts.savedButNotValidated[0].numericSsim, null);
  for (const field of ["publicAcceptance", "goalComplete", "historicalFullOutputRetroactivelyAccepted"]) assert.equal(facts[field], false);
});
test("sample loss, rewritten timestamps, changed denominator, late close or tracker divergence are rejected", () => {
  for (const mutate of [r => { r.nativeFailureCapture.sequence--; }, r => { r.nativeMemory.receiptClockFence.timestampsRewritten = 1; },
    r => { r.nativeMemory.receiptClockFence.monitorClosed = false; }, r => { r.nativeMemory.receiptClockFence.maximumWaitMs = 1001; },
    r => { r.nativeFailureCapture.denominator.privateBytes++; }, r => { r.nativeMemory.phases[0].validSamples--; },
    r => { r.nativeFailureCapture.evaluatedConversionSamples--; }, r => { r.nativeMemory.error = "observer failure"; }]) {
    const wrong = structuredClone(raw); mutate(wrong); assert.throws(() => encoderPlaneClockTerminalFacts(wrong));
  }
});
test("prospective full SSIM diagnostic records bounded numeric/null result BEFORE unchanged0.98 gate, without codec changes", () => {
  const old = makeEncoderPlaneClockFullDriver(previous, root, receipt.wrapper, branch);
  assert.equal(old.generated, executed.generated);
  const next = makeSsimCapturingClockFullDriver(previous, root, receipt.wrapper, branch);
  let reverse = next.generated; for (const [before, after] of next.edits.toReversed()) reverse = reverse.replace(after, before);
  assert.equal(reverse, old.generated); syntax(next.generated);
  assert.ok(next.generated.indexOf("run.independentSsimDiagnostic = inspectSsimSummary(stderr)") < next.generated.indexOf("assert.ok(ssim >= 0.98)"));
  for (const token of ['number <= 3', 'run.incrementalPrivateMiB <= 250', 'maximumTimestampErrorSeconds <= 0.001', 'minimumMs: 300000',
    'metrics.peakPendingOperations <= 1', 'await stopNativeObserverEvenAfterPhaseFailure(observer)', 'expectedSourceBytes = 2958573265'])
    assert.ok(next.generated.includes(token), token);
  // Static driver declarations are parsed first. Join ALL historical measured
  // sources afterwards, including build.sh/patch files outside that grammar.
  const pins = deriveDriverSourcePinFiles(next.generated, []);
  const files = [...new Set([...pins.files, ...Object.keys(receipt.sourcePins)])];
  assert.ok(files.length <= 256); assert.equal(files.length, 252);
  assert.equal(next.publicAcceptance, false);
});
test("terminal-only CLI rejects live/prepared paths before archive reads or owned scratch", () => {
  const run = spawnSync(process.execPath, ["scripts/analyze-encoder-plane-clock-full-terminal.mjs", "evidence/2026-10-11T03-53-11-041Z-encoder-plane-clock-full-live.json"],
    { encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.equal(run.status, 1); assert.equal(run.stdout, ""); assert.match(run.stderr, /AssertionError/);
});
