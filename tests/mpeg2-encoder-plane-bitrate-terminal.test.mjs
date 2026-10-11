import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeClockFullTerminalAnalyzer } from "../scripts/lib/encoder-plane-clock-terminal-recipe.mjs";
import { makeBitrateFullTerminalAnalyzer } from "../scripts/lib/encoder-plane-bitrate-terminal-recipe.mjs";
import { encoderPlaneBitrateTerminalFacts } from "../scripts/lib/encoder-plane-bitrate-terminal-facts.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const receipt = JSON.parse(await read("evidence/2026-10-11T08-24-12-696Z-encoder-plane-bitrate-original-full-terminal.json"));
const record = receipt.candidate.compressedReport, zipped = await read(record.path);
assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
const bytes = gunzipSync(zipped, { maxOutputLength: 33554432 });
assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
const raw = JSON.parse(bytes);
test("bitrate terminal analyzer reverses to strict clock audit with no dropped original gates", async () => {
  const source = (await read("scripts/analyze-encoder-plane-full-terminal.mjs")).toString();
  const old = makeClockFullTerminalAnalyzer(source, root), next = makeBitrateFullTerminalAnalyzer(source, root);
  let reverse = next.generated; for (const [before, after] of next.edits.toReversed()) reverse = reverse.replace(after, before);
  assert.equal(reverse, old.generated);
  const parsed = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: next.generated, encoding: "utf8", windowsHide: true });
  assert.equal(parsed.status, 0, parsed.stderr);
  for (const token of ["assert.equal(executed.generated, expected.generated)", "executed.generatedCaller, caller.generated", "Actual owned birth identity is still alive",
    "fullProtectedPostSha256Verified", "assert.ok(!raw.cleanup.errors?.length)", "33554432", "8388608", "encoder-plane-bitrate-terminal-facts.mjs"])
    assert.ok(next.generated.includes(token), token);
});
test("actual partial4Mbps decoder-frame OOM retains unknown allocation size/quality and zero accepted outputs", () => {
  const facts = encoderPlaneBitrateTerminalFacts(raw);
  assert.equal(facts.native.observedIncrementalPrivateMiB, 231.73046875);
  assert.equal(facts.rowsCountedWithoutDropping, 27057); assert.equal(facts.evaluatedConversionSamples, 24054);
  assert.equal(facts.completedConversions, 0); assert.equal(facts.fullOriginalSessionGatePassed, false);
  assert.equal(facts.actualNativeBitRate, 4000000); assert.equal(facts.actualNativeConfigurationSamples.length, 1);
  const partial = facts.partialFailedRuns[0]; assert.equal(partial.generatedPartialOutputBytes, 1398331053);
  assert.equal(partial.processedInputBytes, 748428500); assert.equal(partial.acceptedOutputBytes, 0);
  assert.equal(partial.qualityValidationReached, false); assert.equal(partial.numericSsim, null);
  const failed = facts.failedAllocationObservation;
  assert.equal(failed.observedCallPath, "HEVC frame allocation via avcodec_default_get_buffer2/av_buffer_allocz");
  assert.equal(failed.attemptedHeapExtentBytes, 34086912); assert.equal(failed.requestedHeapExtentIsIndividualAllocation, false);
  for (const field of ["failedIndividualAllocationBytes", "heapLiveBytes", "allocatorFreeBlocks", "poolRequest"]) assert.equal(failed[field], null);
  assert.equal(failed.fragmentationCauseProven, false); assert.equal(failed.allocationRetentionRootCauseProven, false);
  assert.equal(facts.publicAcceptance, false); assert.equal(facts.goalComplete, false);
});
test("native settings mismatch, row loss or clock close failure cannot inherit an under-budget window", () => {
  for (const mutate of [r => { r.bitrateAuditSamples[0].words[8] = 2000000; },
    r => { r.nativeMemory.receiptClockFence.monitorClosed = false; }, r => { r.nativeFailureCapture.sequence--; }]) {
    const wrong = structuredClone(raw); mutate(wrong); assert.throws(() => encoderPlaneBitrateTerminalFacts(wrong));
  }
});
test("terminal CLI rejects live/preparation identities before scratch or browser actions", () => {
  const result = spawnSync(process.execPath, ["scripts/analyze-encoder-plane-bitrate-full-terminal.mjs", "evidence/2026-10-11T08-24-12-696Z-encoder-plane-bitrate-full-live.json"],
    { encoding: "utf8", windowsHide: true, timeout: 10000 });
  assert.equal(result.status, 1); assert.equal(result.stdout, ""); assert.match(result.stderr, /AssertionError/);
});
