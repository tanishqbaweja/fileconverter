// Recompute actual retained observations. No new browser or completion claim.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { splitRenderNativeFacts, splitRenderFirstFailureFacts } from "../scripts/lib/split-render-progress-evidence.mjs";
import { compareOutputWorkWindows } from "../scripts/lib/split-copy-work-checkpoints.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const proof = JSON.parse(await read("evidence/2026-10-09T14-56-09-725Z-split-copy-corrected-candidate-analysis.json"));
const receiptBytes = await read(proof.receipt.path); assert.equal(sha(receiptBytes), proof.receipt.sha256);
const receipt = JSON.parse(receiptBytes), compressed = await read(receipt.candidate.compressedReport.path);
assert.equal(sha(compressed), receipt.candidate.compressedReport.sha256);
const bytes = gunzipSync(compressed); assert.equal(sha(bytes), receipt.candidate.rawReport.sha256);
const raw = JSON.parse(bytes);
test("Whole-tree native peak and first pre-cancel renderer burst independently reproduce the rejection, not its allocation cause", async () => {
  assert.equal(sha(await read("scripts/analyze-split-copy-candidate-only.mjs")), proof.verifierSha256);
  assert.deepEqual(splitRenderNativeFacts(raw, "candidate"), proof.candidateNative);
  assert.equal(proof.candidateNative.observedIncrementalPrivateMiB, 271.88671875);
  const first = splitRenderFirstFailureFacts(raw); assert.deepEqual(first, proof.firstFailure);
  assert.equal(first.firstFailure.incrementalPrivateMiB, 260.31640625);
  assert.equal(first.firstFailure.delta.treeDeltaPrivateBytes, 55246848);
  const changes = first.firstFailure.processChanges.filter(row => row.deltaPrivateBytes !== 0);
  assert.equal(changes.length, 1); assert.equal(changes[0].cimObservedType, "renderer");
  assert.equal(first.causeProven, false); assert.equal(proof.delayedPostCancelDumpIsPeakAllocationEvidence, false);
});
test("Three later actual work brackets and contiguous first frame contradict the proposed row-loop speed benefit for the observed original frame", () => {
  const work = compareOutputWorkWindows(receipt.reusedBaseline.workCheckpoints, raw.progressProbe.workCheckpoints);
  assert.deepEqual(work, proof.workWindows);
  assert.ok(work.slice(0, 3).every(row => row.status === "candidate-later-window"));
  assert.ok(work.slice(3).every(row => row.status === "unavailable" && row.candidateMinusBaselineMs === null));
  assert.deepEqual(raw.splitFinalSamples[0].firstFrameCopyLayout, proof.firstFrameLayout);
  assert.deepEqual(proof.firstFrameLayout.sourceStrides, [1920, 960, 960]);
  assert.deepEqual(proof.firstFrameLayout.targetStrides, [1920, 960, 960]);
  assert.equal(raw.splitFinalSamples[0].copyKernel.nativePlaneCalls, 4392);
  assert.equal(raw.splitFinalSamples[0].frames, 1464);
  assert.equal(proof.originalPerRowLoopEliminatedForObservedFrame, false);
  assert.equal(proof.allFramesLayoutObserved, false); assert.equal(proof.causalSpeedRegressionProven, false);
});
test("Failed candidate remains private and incomplete, with genuine terminal ownership/cleanup evidence", async () => {
  assert.equal(proof.status, "independently-verified-copy-candidate-rejected-for-original-profile");
  for (const key of ["conversionSpeedAcceptance", "completeChromiumMemoryAcceptance", "originalFullSourceAcceptance", "publicAcceptance"])
    assert.equal(proof[key], false);
  assert.equal(proof.conversionsCompleted, 0); assert.equal(proof.completeOutputsIndependentlyValidated, 0);
  assert.equal(proof.cleanupIdentities.originalIdentityCount, 22);
  assert.equal(proof.cleanupIdentities.originalIdentitiesAbsent, true); assert.equal(proof.cleanupIdentities.noProcessesKilled, true);
  assert.equal(proof.fullProtectedPostSha256Verified, true); assert.equal(proof.normalProductionAndEngineAssetsRestored, true);
  assert.equal(proof.finalSplitMetrics.closed, true); assert.equal(proof.finalSplitMetrics.copyKernel.closed, true);
  assert.equal(proof.finalSplitMetrics.queuedPackets, 0); assert.equal(proof.finalSplitMetrics.activePackets, 0);
  assert.equal(raw.runs[0].state.jobState, "cancelled"); assert.equal(raw.runs[0].independentValidation, null);
  await assert.rejects(access(path.join(root, receipt.candidate.rawReport.path)), { code: "ENOENT" });
  await assert.rejects(access(raw.runtimeDirectory), { code: "ENOENT" });
});
