import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectFailedAllocationAttemptFull } from "../scripts/analyze-allocation-attempt-full-terminal.mjs";
const root = path.resolve(import.meta.dirname, "..");
async function raw() { const p = JSON.parse(await readFile(path.join(root, "evidence/2026-10-11T14-01-14-330Z-allocation-attempt-original-full-terminal.json"))); return JSON.parse(gunzipSync(await readFile(path.join(root, p.candidate.compressedReport.path)))); }
test("actual failed original captures wrapper request/freed alignment fallback and free headers, NOT internal malloc size or acceptance", async () => {
  const facts = inspectFailedAllocationAttemptFull(await raw());
  assert.equal(facts.processedInputBytes, 748428500); assert.equal(facts.generatedPartialOutputBytes, 1398331053); assert.equal(facts.frames, 74921);
  assert.equal(facts.failedAllocation.wrapperRequestedBytes, 1597463); assert.equal(facts.failedAllocation.phase, "upstream-alignment-pending");
  assert.equal(facts.failedAllocation.freshUnexposedPointer, 3521864); assert.equal(facts.failedAllocation.freshUnexposedPointerFreed, true);
  assert.equal(facts.failedAllocation.failedIndividualAllocationBytes, null); assert.equal(facts.failedAllocation.heapLiveBytes, null);
  assert.equal(facts.failedAllocation.allocatorFreeBlocks.totalFreeChunkBytes, 7436456); assert.equal(facts.failedAllocation.allocatorFreeBlocks.largestFreeChunkBytes, 1597496);
  assert.equal(facts.failedAllocation.fragmentationCauseProven, false); assert.equal(facts.failedAllocation.originalFailureCauseProven, false);
  assert.equal(facts.native.actualPeakPrivateBytes, 485965824); assert.equal(facts.native.blankPrivateBytes, 240332800);
  assert.equal(facts.native.observedIncrementalPrivateMiB, 234.25390625); assert.equal(facts.rowsCountedWithoutDropping, 30447);
  assert.equal(facts.acceptedOutputBytes, 0); assert.equal(facts.completedConversions, 0); assert.equal(facts.numericSsim, null);
  assert.equal(facts.publicAcceptance, false); assert.equal(facts.fullOriginalAcceptance, false); assert.equal(facts.completeChromiumMemoryAcceptance, false);
});
test("failure audit rejects stale binary, partial-as-complete, invented internal request, drop/zero/rewritten clock and weaker gates", async () => {
  const original = await raw();
  for (const mutate of [r => { r.status = "passed-private-protected-session"; }, r => { r.limitMiB = 251; },
    r => { r.requestedRuns = 1; }, r => { r.manifest.artifacts["within-mpeg2-split.wasm"] = "0".repeat(64); },
    r => { r.abortDiagnostic.records[0].failedIndividualAllocationBytes = 1597463; }, r => { r.nativeMemory.sequence--; },
    r => { r.nativeMemory.receiptClockFence.samplesDropped++; }, r => { r.nativeMemory.receiptClockFence.timestampsRewritten++; },
    r => { r.startupSettlement.processesExcluded++; }, r => { r.runs[0].state.metrics.peakQueuedBytes = 1048577; }]) {
    const invalid = structuredClone(original); mutate(invalid); assert.throws(() => inspectFailedAllocationAttemptFull(invalid));
  }
});
