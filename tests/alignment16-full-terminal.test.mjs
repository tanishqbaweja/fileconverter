import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { alignment16FailureInspectorRecipe, inspectFailedAlignment16Full } from "../scripts/analyze-alignment16-full-terminal.mjs";
const root = path.resolve(import.meta.dirname, "..");
const terminal = JSON.parse(await readFile(path.join(root, "evidence/2026-10-11T18-50-12-867Z-alignment16-original-full-terminal.json")));
const zipped = await readFile(path.join(root, terminal.candidate.compressedReport.path));
assert.equal(sha(zipped), terminal.candidate.compressedReport.sha256);
const bytes = gunzipSync(zipped, { maxOutputLength: 33554432 }); assert.equal(sha(bytes), terminal.candidate.compressedReport.restoredSha256);
const raw = JSON.parse(bytes);
test("actual new first-malloc failure retains native peaks, all fatal scalars and unchanged full validation gates", async () => {
  const result = await inspectFailedAlignment16Full(raw);
  assert.equal(result.completedConversions, 0); assert.equal(result.acceptedOutputBytes, 0); assert.equal(result.numericSsim, null);
  assert.equal(result.failedAllocation.phase, "fast-malloc-pending"); assert.equal(result.failedAllocation.wrapperRequestedBytes, 399383);
  assert.equal(result.failedAllocation.failedIndividualAllocationBytes, 399383); assert.equal(result.failedAllocation.freshUnexposedPointerFreed, false);
  assert.equal(result.failedAllocation.allocatorFreeBlocks.largestFreeChunkBytes, 213728);
  assert.equal(result.failedAllocation.heapLiveBytes, null); assert.equal(result.failedAllocation.fragmentationCauseProven, false);
  assert.equal(result.sameFailedConfigurationShouldBeRepeated, false); assert.equal(result.fullOriginalAcceptance, false);
  const recipe = await alignment16FailureInspectorRecipe();
  for (const [before] of recipe.edits.filter(([before]) => !before.startsWith("import")))
    for (const gate of ["limitMiB", "blankBaseline", "validateFullBitrateAudit", "fullProgressNativeFacts"]) assert.ok(!before.includes(gate));
});
test("failure audit rejects old binary, fake completion, weaker memory limit and altered scalar request", async () => {
  for (const mutate of [value => { value.limitMiB = 251; }, value => { value.runs[0].state.jobState = "complete"; },
    value => { value.manifest.artifacts["within-mpeg2-split.wasm"] = "9ce-old"; },
    value => { value.abortDiagnostic.records[0].allocationAttempt.wrapperRequestedBytes++; }]) {
    const copy = structuredClone(raw); mutate(copy); await assert.rejects(inspectFailedAlignment16Full(copy));
  }
});
