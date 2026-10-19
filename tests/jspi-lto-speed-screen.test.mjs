import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { compareJspiLtoScreen, SCREEN_ORDER } from "../scripts/lib/jspi-lto-speed-screen.mjs";
import { auditJspiLtoBlock } from "../scripts/lib/jspi-lto-block-audit.mjs";
function blocks(times = [100, 90, 90, 100]) {
  return SCREEN_ORDER.map((variant, index) => ({ variant, audit: { complete: true, originalValidatorsUnchanged: true },
    browserPinBefore: { pinned: true }, browserPinAfter: { pinned: true }, validatorSha256: "same", fixtureSha256: "same",
    nativeSettings: [4000000], analysis: { completedSmallOutputs: 6, completeAdverseRecoveryValidated: true,
      allSixOutputBytesAndPacketProofsIdenticalToQualifiedParent: true, peakIncrementalPrivateMiB: 240,
      conversionUnavailableSamples: 0, elapsedMs: Array(6).fill(times[index]), outputSha256: "same" } }));
}
test("balanced screen requires both order pairs to improve by five percent, without broad speed/acceptance claims", () => {
  const result = compareJspiLtoScreen(blocks());
  assert.equal(result.screenPassed, true); assert.equal(result.independentSessionCount, 4);
  assert.equal(result.allValidatedOutputs, 24); assert.equal(result.allAdverseRecoveries, 12);
  assert.equal(result.generalSpeedGainProven, false); assert.equal(result.publicAcceptance, false);
  assert.equal(compareJspiLtoScreen(blocks([100, 98, 98, 100])).screenPassed, false);
  assert.equal(compareJspiLtoScreen(blocks([100, 70, 101, 100])).screenPassed, false);
  assert.equal(compareJspiLtoScreen(blocks([100, 110, 110, 100])).screenPassed, false);
});
test("unbalanced order, mismatched fixture/browser/settings/validator or any failed quality/memory gate is rejected", () => {
  for (const mutate of [
    value => { value[3].variant = "lto"; }, value => { value[1].fixtureSha256 = "different"; },
    value => { value[1].browserPinAfter = { pinned: false }; }, value => { value[2].nativeSettings = [2000000]; },
    value => { value[1].validatorSha256 = "weaker"; }, value => { value[1].analysis.peakIncrementalPrivateMiB = 250.001; },
    value => { value[1].analysis.completeAdverseRecoveryValidated = false; }, value => { value[1].analysis.elapsedMs[1] = null; },
  ]) { const changed = blocks(); mutate(changed); assert.throws(() => compareJspiLtoScreen(changed)); }
});
test("complete independent block auditor replays the two already-retained sessions without new conversions", async () => {
  for (const [variant, file] of [["jspi", "evidence/2026-10-17T22-38-25-691Z-jspi-control-terminal.json"],
    ["lto", "evidence/2026-10-19T16-57-21-316Z-lto-control-terminal.json"]]) {
    const result = await auditJspiLtoBlock(process.cwd(), variant, file);
    assert.equal(result.audit.complete, true); assert.equal(result.audit.sourcePins, variant === "jspi" ? 832 : 853);
    assert.equal(result.fixtureSha256, "6de34df2f96e8cce3318f21893d07a395b31a6968d680bd40484f6e8771a5dcb");
    assert.equal(result.analysis.completedSmallOutputs, 6);
    const terminal = JSON.parse(await readFile(file)), report = JSON.parse(gunzipSync(await readFile(terminal.report.path)));
    assert.equal(result.analysis.elapsedMs.length, report.progressProbe.successfulSaveControl.successfulFixtureValidations);
  }
});
test("orchestrator keeps sequential hidden launches, fixed journals, no automatic retry, and exact owned success cleanup", async () => {
  const source = await readFile("scripts/run-jspi-lto-speed-screen.mjs", "utf8");
  for (const token of ["windowsHide: true", "boundedTail()", "supervisorJournal", "for (const [index, variant] of SCREEN_ORDER.entries())",
    "state.active.exit = await closed", "await auditJspiLtoBlock", "await compactSuccessfulBlock", "Stop on failure; no automatic rerun or next session",
    'finally { await rm(trace);', 'assert.equal(path.dirname(checkpoint), path.join(root, "outputs/reports"))',
    "await observeOwnedProcessExit", "await protectedOriginal()", "state.originalAfter, state.originalBefore", "assertInstalledChromePinsEqual"])
    assert.ok(source.includes(token), token);
  assert.doesNotMatch(source, /headless:\s*false|cmd\s*\/k|taskkill|docker\s+(run|build)/i);
});
