import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { inspectDurationFullTerminal } from "../scripts/lib/duration-drain-full-terminal.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const terminal = JSON.parse(await read("evidence/2026-10-15T11-18-16-969Z-duration-drain-original-full-terminal.json"));
const zip = await read(terminal.candidate.compressedReport.path), record = terminal.candidate.compressedReport;
assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
const raw = gunzipSync(zip, { maxOutputLength: 33554432 }); assert.equal(raw.length, record.restoredBytes); assert.equal(sha(raw), record.restoredSha256);
const report = JSON.parse(raw);
test("actual full encoding296160 frames reaches6.414GB staging but final save fails258.168MiB primary budget", () => {
  const result = inspectDurationFullTerminal(terminal, report);
  assert.equal(result.frames, 296160); assert.equal(result.primaryMemory.passed, false);
  assert.equal(result.completedValidatedRuns, 0); assert.equal(result.stagedOutputBytes, 6414309978);
  assert.equal(result.primaryMemory.exactAllocationObjectOrCallsite, null); assert.equal(result.fullOriginalAcceptance, false);
});
test("secondary cancellation-progress error cannot hide budget failure or manufacture validated completion", () => {
  for (const mutate of [r => { r.nativeFailureCapture.firstFailure.after.privateBytes = 493330432; },
    r => { r.runs[0].independentValidation = { passed: true }; }, r => { r.splitFinalSamples[0].completedPackets--; },
    r => { r.quiescedBudgetCapture.stateAfter.metrics.scratchBytes = 6414309978; },
    r => { r.quiescedBudgetCapture.cancellation.cancellationRequested = false; },
    r => { r.nativeMemory.receiptClockFence.samplesDropped = 1; }, r => { r.forbiddenRequests.push({ uploaded: true }); }]) {
    const changed = structuredClone(report); mutate(changed); assert.throws(() => inspectDurationFullTerminal(terminal, changed));
  }
});
test("independent terminal audit preserves source656, original checksum, lossless checkpoint and birth-safe cleanup", async () => {
  const audit = JSON.parse(await read("evidence/2026-10-15T11-18-16-969Z-duration-drain-full-terminal-analysis.json"));
  assert.equal(audit.terminal.sha256, sha(await read(audit.terminal.path)));
  assert.equal(audit.supervisor.sha256, sha(await read(audit.supervisor.path)));
  const expected = inspectDurationFullTerminal(terminal, report);
  for (const [key, value] of Object.entries(expected)) assert.deepEqual(audit[key], value, key);
  assert.equal(audit.all656CurrentPostExecutedPreimagesVerified, true);
  assert.equal(audit.originalWholePrePostCurrentSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(audit.birthChecks.length, 26); assert.ok(audit.birthChecks.every(row => row.ownedBirthAbsent));
  assert.equal(audit.allOwnedMediaAndProfilesAbsent, true); assert.equal(audit.normalAssetsRestored, true);
  for (const [file, source] of Object.entries(audit.ownSources)) {
    assert.equal(sha(await read(file)), source.sha256); assert.equal(sha(Buffer.from(source.preimage, "base64")), source.sha256);
  }
  const record = audit.losslesslyCompactedCheckpoint.archive, zip = await read(record.path);
  assert.equal(zip.length, record.bytes); assert.equal(sha(zip), record.sha256);
  const restored = gunzipSync(zip, { maxOutputLength: 8388608 });
  assert.equal(restored.length, record.restoredBytes); assert.equal(sha(restored), record.restoredSha256);
  assert.equal(JSON.parse(restored).coverageThroughSequence, report.nativeMemory.sequence);
});
