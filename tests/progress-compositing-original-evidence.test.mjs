// Actual terminal prefix diagnostic, not full conversion acceptance or causal speed proof.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { splitRenderNativeFacts } from "../scripts/lib/split-render-progress-evidence.mjs";
import { compareOutputWorkWindows } from "../scripts/lib/split-copy-work-checkpoints.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const audit = JSON.parse(await read("evidence/2026-10-09T16-13-20-461Z-progress-compositing-original-analysis.json"));
const receiptBytes = await read(audit.receipt.path); assert.equal(sha(receiptBytes), audit.receipt.sha256); const receipt = JSON.parse(receiptBytes);
async function decode(record, max = 32 * 1024 ** 2) {
  const bytes = await read(record.path); assert.equal(bytes.length, record.bytes); assert.equal(sha(bytes), record.sha256);
  return gunzipSync(bytes, { maxOutputLength: max });
}
const rawBytes = await decode(receipt.candidate.compressedReport); assert.equal(sha(rawBytes), receipt.candidate.rawReport.sha256);
const raw = JSON.parse(rawBytes), sourceBytes = await decode(receipt.sourceArchive, 8 * 1024 ** 2);
assert.equal(sha(sourceBytes), receipt.sourceArchive.restoredSha256); const source = JSON.parse(sourceBytes);
const supplementBytes = await decode(audit.supplementarySourceArchive); assert.equal(sha(supplementBytes), audit.supplementarySourceArchive.restoredSha256);
const supplement = JSON.parse(supplementBytes);
const baseBytes = await decode(receipt.reusedBaseline.rawArchive), baseline = JSON.parse(baseBytes);

test("Whole simultaneous native tree stays below250 in measured prefix only, strict original denominator, valid samples/no full acceptance", () => {
  assert.equal(receipt.executions, 1); assert.equal(raw.runs.length, 1); assert.equal(raw.runs[0].state.jobState, "cancelled");
  assert.equal(raw.progressProbe.checkpointReached, true); assert.equal(raw.runs[0].independentValidation, null);
  assert.equal(audit.native.observedIncrementalPrivateMiB, 229.8671875); assert.equal(audit.native.blankPrivateBytes, 240709632);
  assert.equal(audit.native.actualPeakPrivateBytes, 481742848); assert.deepEqual(splitRenderNativeFacts(raw, "candidate"), audit.native);
  assert.deepEqual(audit.native.phaseCoverage, [{ phase: "pre-conversion-1", validSamples: 5, unavailableSamples: 0 },
    { phase: "conversion-1", validSamples: 1657, unavailableSamples: 0 }]);
  assert.equal(audit.native.primaryLimitExceededInObservedWindow, false); assert.equal(audit.firstFailure.firstFailure, null);
  assert.equal(audit.finalSplitMetrics.frames, 6044); assert.equal(audit.finalSplitMetrics.completedPackets, 6044);
  assert.equal(audit.finalSplitMetrics.copiedPixelBytes, 13995002880); assert.equal(audit.finalSplitMetrics.copyKernel, undefined);
  assert.equal(audit.finalSplitMetrics.closed, true); assert.equal(audit.lastReportedMetrics.outputBytes, 68103002);
  assert.equal(audit.lastReportedMetrics.inputBytes, 60367771); assert.equal(audit.lastReportedMetrics.peakWasmMemoryBytes, 50331648);
  for (const field of ["conversionSpeedAcceptance", "completeChromiumMemoryAcceptance", "originalFullSourceAcceptance", "publicAcceptance", "lateHevcPoolOomResolved"])
    assert.equal(audit[field], false);
  assert.equal(audit.completedConversions, 0); assert.equal(audit.completeOutputsIndependentlyValidated, 0);
});

test("All source-list entries accounted for: original145 preimages plus three executed Git blobs, controller failure kept", () => {
  assert.equal(receipt.status, "failed-or-incomplete"); assert.match(receipt.failure, /scripts\/diagnose-split-render-progress\.mjs/);
  assert.equal(audit.originalControllerFailurePreserved, true); assert.equal(receipt.workWindows, null);
  assert.equal(Object.keys(source.sourcePreimages).length, 145); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
  for (const [file, record] of Object.entries(source.sourcePreimages)) assert.equal(sha(Buffer.from(record.data, "base64")), receipt.sourcePins[file]);
  assert.equal(Object.keys(supplement.supplementarySourcePreimages).length, 3); assert.equal(supplement.executedCommit, "9479876");
  for (const [file, hash] of Object.entries(raw.sourceHashes)) {
    const extra = supplement.supplementarySourcePreimages[file];
    if (extra) { assert.equal(sha(Buffer.from(extra.data, "base64")), hash); assert.equal(extra.sha256, hash); }
    else assert.equal(receipt.sourcePins[file], hash);
  }
  assert.equal(audit.completeDriverSourceListNowVerified, true); assert.equal(audit.exactDriverAndHelperReconstructed, true);
  assert.deepEqual(raw.progressProbe.actualServedAsset, audit.actualServedApp); assert.deepEqual(raw.cssCandidate.css, baseline.cssCandidate.css);
  assert.equal(raw.cssCandidate.staticAssets[0].beforeSha256, audit.actualServedStylesheet.sha256);
  assert.equal(raw.cssCandidate.staticAssets[0].afterSha256, audit.actualServedStylesheet.afterSha256);
});

test("Observed checkpoints later despite fewer layouts; old control not rerun, no causal/fastest/lateOOM claim, actual cleanup birth bound", () => {
  assert.deepEqual(compareOutputWorkWindows(baseline.progressProbe.workCheckpoints, raw.progressProbe.workCheckpoints), audit.workWindows);
  assert.deepEqual(audit.workWindows.map(row => row.status), ["overlapping-windows", "overlapping-windows", "candidate-later-window", "candidate-later-window", "candidate-later-window"]);
  assert.ok(audit.workWindows[4].candidateMinusBaselineMs[0] > 5000); assert.equal(audit.causalSpeedImprovementProven, false);
  const delta = (report, name) => {
    const probe = report.progressProbe;
    return probe.performanceAfter.metrics.find(row => row.name === name).value - probe.performanceBefore.metrics.find(row => row.name === name).value;
  };
  assert.equal(delta(baseline, "LayoutCount"), 28939); assert.equal(delta(raw, "LayoutCount"), 1548);
  assert.ok(Math.abs(delta(baseline, "LayoutDuration") - 3.410801) < 1e-9); assert.ok(Math.abs(delta(raw, "LayoutDuration") - 0.279679) < 1e-9);
  assert.equal(audit.cleanupIdentities.originalIdentityCount, 23); assert.equal(audit.cleanupIdentities.originalIdentitiesAbsent, true);
  assert.equal(audit.cleanupIdentities.noProcessesKilled, true); assert.equal(audit.normalProductionAndEngineAssetsRestored, true);
  assert.equal(audit.fullProtectedPostSha256Verified, true); assert.equal(audit.allElevenPrivateAssetsAbsent, true);
  assert.equal(receipt.wrapperAbsent, true); assert.equal(receipt.driverAbsent.status, "owned-identity-absent");
  assert.equal(raw.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.deepEqual(raw.forbiddenRequests, []); assert.equal(audit.browserMode, "headless"); assert.equal(audit.windowsHidden, true);
});
