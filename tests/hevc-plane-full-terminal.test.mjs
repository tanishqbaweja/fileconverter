import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectFailedHevcPlaneFull } from "../scripts/analyze-hevc-plane-full-terminal.mjs";
const root = path.resolve(import.meta.dirname, "..");
const terminal = JSON.parse(await readFile(path.join(root, "evidence/2026-10-11T23-47-49-089Z-hevc-plane-original-full-terminal.json")));
const zipped = await readFile(path.join(root, terminal.candidate.compressedReport.path));
assert.equal(sha(zipped), terminal.candidate.compressedReport.sha256);
const restored = gunzipSync(zipped, { maxOutputLength: 33554432 }); assert.equal(sha(restored), terminal.candidate.compressedReport.restoredSha256);
const raw = JSON.parse(restored);
test("actual packet-realloc failure preserves every native peak/validation gate and uncompleted packet; no allocation bytes or free inventory invented", () => {
  const result = inspectFailedHevcPlaneFull(raw);
  assert.equal(result.observedFailureCallPath, "packet-reallocation"); assert.equal(result.individualAllocationObserved, false);
  assert.equal(result.frames, 244873); assert.equal(result.completedPackets, 244872); assert.equal(result.uncompletedBridgedPackets, 1);
  assert.equal(result.generatedPartialOutputBytes, 4778321222); assert.equal(result.elapsedMs, 9782117.139999986);
  assert.equal(result.completedConversions, 0); assert.equal(result.acceptedOutputBytes, 0); assert.equal(result.numericSsim, null);
  assert.equal(result.failedAllocation.attemptedHeapExtentBytes, 33599488); assert.equal(result.failedAllocation.requestedHeapExtentIsIndividualAllocation, false);
  for (const key of ["failedIndividualAllocationBytes", "wrapperRequestedBytes", "phase", "sequence", "allocatorFreeBlocks", "heapLiveBytes"]) assert.equal(result.failedAllocation[key], null);
  assert.equal(result.sameFailedConfigurationShouldBeRepeated, false); assert.equal(result.fullOriginalAcceptance, false);
});
test("failure audit rejects weaker budget/fake completion/old binary/pretended wrapper path/normalized completed packet count", () => {
  for (const mutate of [copy => { copy.limitMiB = 251; }, copy => { copy.runs[0].state.jobState = "complete"; },
    copy => { copy.manifest.artifacts["within-mpeg2-split.wasm"] = "417-old"; },
    copy => { copy.abortDiagnostic.records[0].qualifiedDirectBufferCallPath = true; },
    copy => { copy.splitFinalSamples[0].completedPackets++; }]) {
    const copy = structuredClone(raw); mutate(copy); assert.throws(() => inspectFailedHevcPlaneFull(copy));
  }
});
