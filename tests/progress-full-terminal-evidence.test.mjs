import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { progressFullTerminalFacts } from "../scripts/lib/progress-full-terminal-facts.mjs";
import { alignedFallbackCapacityFacts } from "../scripts/lib/aligned-fallback-capacity.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const receipt = JSON.parse(await read("evidence/2026-10-09T16-55-27-062Z-progress-compositing-original-full-completion.json"));
const compressed = await read(receipt.candidate.compressedReport.path);
assert.equal(sha(compressed), receipt.candidate.compressedReport.sha256);
const rawBytes = gunzipSync(compressed, { maxOutputLength: 32 * 1048576 });
assert.equal(sha(rawBytes), receipt.candidate.rawReport.sha256); const raw = JSON.parse(rawBytes);
const analysis = JSON.parse(await read("evidence/2026-10-09T16-55-27-062Z-progress-compositing-original-full-completion-analysis.json"));

test("Actual full attempt failed decoder at106112 frames below observed250; never certify full output or encoder-only flag", () => {
  const facts = progressFullTerminalFacts(raw);
  assert.deepEqual(facts.native, analysis.native); assert.equal(facts.native.blankPrivateBytes, 243978240);
  assert.equal(facts.native.actualPeakPrivateBytes, 482906112); assert.equal(facts.native.observedIncrementalPrivateMiB, 227.859375);
  assert.deepEqual(facts.native.phaseCoverage, [{ phase: "pre-conversion-1", validSamples: 6, unavailableSamples: 0 },
    { phase: "conversion-1", validSamples: 31989, unavailableSamples: 0 }]);
  assert.equal(facts.finalOwnership.frames, 106112); assert.equal(facts.finalOwnership.failed, false);
  assert.equal(facts.encoderOwnershipFailedFlagDoesNotProveDecoderSuccess, true);
  assert.equal(facts.failedDecoderRequest.failedIndividualAllocationBytes, 1163536);
  assert.equal(facts.attemptedHeapExtentBytes, 33587200); assert.equal(facts.attemptedHeapExtentIsIndividualAllocation, false);
  assert.equal(facts.allocatorFreeHeaders.totalFreeChunkBytes, 6523400); assert.equal(facts.fragmentationCauseProven, false);
  for (const key of ["completeChromiumMemoryAcceptance", "originalFullSourceAcceptance", "publicAcceptance", "conversionSpeedAcceptance", "lateHevcPoolOomResolved"])
    assert.equal(facts[key], false);
});

test("Reject fake completion, short checkpoint, wrong budget/formula/missing native peaks and altered allocation inventory", () => {
  assert.throws(() => progressFullTerminalFacts({ ...raw, status: "passed" }));
  assert.throws(() => progressFullTerminalFacts({ ...raw, progressProbe: { ...raw.progressProbe, checkpointOutputBytes: 67108864 } }));
  assert.throws(() => progressFullTerminalFacts({ ...raw, limitMiB: 251 }));
  assert.throws(() => progressFullTerminalFacts({ ...raw, formula: "wasm memory" }));
  const changedAbort = patch => ({ ...raw, abortDiagnostic: { ...raw.abortDiagnostic, records: [{ ...raw.abortDiagnostic.records[0], ...patch }] } });
  assert.throws(() => progressFullTerminalFacts(changedAbort({ latePoolRequestUnavailable: "missing" })));
  assert.throws(() => progressFullTerminalFacts(changedAbort({ allocatorFreeBlocks: { ...raw.abortDiagnostic.records[0].allocatorFreeBlocks, totalFreeChunkBytes: 0 } })));
  assert.throws(() => progressFullTerminalFacts({ ...raw, nativeMemory: { ...raw.nativeMemory, error: "sampling failed" } }));
});

const flowBytes = await read("evidence/progress-full-aligned-normalization-verified-2026-10-10.json"), flow = JSON.parse(flowBytes);
const allocatorBytes = await read(flow.allocatorInput.path), allocator = JSON.parse(allocatorBytes);
assert.equal(sha(allocatorBytes), flow.allocatorInput.sha256);
const capacityBytes = await read("evidence/progress-full-aligned-capacity-2026-10-10.json"), capacity = JSON.parse(capacityBytes);
assert.equal(capacity.inputs["evidence/progress-full-aligned-normalization-verified-2026-10-10.json"].sha256, sha(flowBytes));
const input = { wrapperText: flow.inspection.wrapperText, allocatorText: allocator.inspection.selectedFunctions.emscripten_builtin_malloc.text,
  fatalCallOffset: flow.inspection.actualFatalCallOffset, request: analysis.failedDecoderRequest, freeHeaders: analysis.allocatorFreeHeaders };

test("Actual compiled aligned fallback double-rounding misses every recorded free chunk by8 bytes; no runtime fix or pointer claim", () => {
  const facts = alignedFallbackCapacityFacts(input);
  for (const [key, value] of Object.entries(facts)) assert.deepEqual(capacity[key], value, key);
  assert.equal(facts.ordinaryMallocChunkBytes, 1163544); assert.equal(facts.fallbackMallocArgumentBytes, 1163572);
  assert.equal(facts.fallbackMallocChunkBytes, 1163576); assert.equal(facts.fallbackChunkShortfallBytes, 8);
  assert.equal(facts.fragmentedFreeCapacityForActualFallbackProven, true);
  assert.equal(facts.observedOrdinaryMallocPointer, null); assert.equal(facts.ordinaryMallocPointerAlignmentObserved, false);
  assert.equal(facts.whyAllocatorFragmentedProven, false); assert.equal(facts.runtimeFixImplemented, false);
  assert.equal(facts.publicAcceptance, false);
});

test("Reject different fatal site/compiled padding, incomplete free headers, insufficient total capacity or a fitting free chunk", () => {
  assert.throws(() => alignedFallbackCapacityFacts({ ...input, fatalCallOffset: "0x606c1e" }));
  assert.throws(() => alignedFallbackCapacityFacts({ ...input, wrapperText: input.wrapperText.replace("i32.const 28", "i32.const 24") }));
  assert.throws(() => alignedFallbackCapacityFacts({ ...input, allocatorText: input.allocatorText.replace("local.tee $l1\n                  i32.const -8", "local.tee $l1\n                  i32.const -16") }));
  assert.throws(() => alignedFallbackCapacityFacts({ ...input, freeHeaders: { ...input.freeHeaders, complete: false } }));
  assert.throws(() => alignedFallbackCapacityFacts({ ...input, freeHeaders: { ...input.freeHeaders, totalFreeChunkBytes: 1000000 } }));
  assert.throws(() => alignedFallbackCapacityFacts({ ...input, freeHeaders: { ...input.freeHeaders, largestFreeChunkBytes: 1163576 } }));
});

test("Lossless executed analyzer preimages preserve actual successful and failed static source versions before lint-only rename", async () => {
  const receipt = JSON.parse(await read("evidence/progress-full-terminal-analysis-source-archive-2026-10-10.json"));
  const gzip = await read(receipt.sourceArchive.path); assert.equal(sha(gzip), receipt.sourceArchive.sha256);
  const bytes = gunzipSync(gzip, { maxOutputLength: 1048576 }); assert.equal(sha(bytes), receipt.sourceArchive.restoredSha256);
  const { sourcePreimages } = JSON.parse(bytes); assert.equal(Object.keys(sourcePreimages).length, 11);
  for (const preimage of Object.values(sourcePreimages)) assert.equal(sha(Buffer.from(preimage.data, "base64")), preimage.sha256);
  assert.equal(sourcePreimages["scripts/audit-progress-full-aligned-normalization.mjs"].sha256, flow.sourceSha256);
  const failed = JSON.parse(await read("evidence/progress-full-aligned-normalization-2026-10-10.json"));
  assert.equal(sourcePreimages["failed-normalization-first-attempt"].sha256, failed.sourceSha256);
  assert.equal(failed.cleanup.ownedRuntimeRemoved, true); assert.equal(failed.browserConversionsPerformed, 0);
  const current = (await read("scripts/audit-progress-full-aligned-normalization.mjs")).toString();
  const old = current.replaceAll("disassemblyModule", "module");
  assert.equal(sha(old), flow.sourceSha256, "Only the lint-reserved variable name changed after static execution");
});
