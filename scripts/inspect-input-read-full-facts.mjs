// Read-only bounded summary of the actual terminal report, never a rerun.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const terminal = JSON.parse(await read("evidence/2026-10-12T19-50-01-210Z-input-read-original-full-terminal.json"));
const record = terminal.candidate.compressedReport, compressed = await read(record.path);
assert.equal(sha(compressed), record.sha256); assert.equal(compressed.length, record.bytes);
const bytes = gunzipSync(compressed, { maxOutputLength: 33554432 }); assert.equal(sha(bytes), record.restoredSha256); assert.equal(bytes.length, record.restoredBytes);
const raw = JSON.parse(bytes); assert.equal(raw.runs.length, 1);
console.log(JSON.stringify({ state: { jobState: raw.runs[0].state.jobState, metrics: raw.runs[0].state.metrics, error: raw.runs[0].state.error }, peakPrivateBytes: raw.runs[0].peakPrivateBytes,
  incremental: raw.runs[0].incrementalPrivateMiB, blankBaseline: raw.blankBaseline,
  nativePhases: raw.nativeMemory.phases.map(row => ({ phase: row.phase, valid: row.validSamples, unavailable: row.unavailableSamples, peakPrivateBytes: row.peak?.[3], peakRssBytes: row.rssPeak?.[4] })),
  sequence: raw.nativeMemory.sequence, receiptClockFence: { samplesDropped: raw.nativeMemory.receiptClockFence.samplesDropped,
    timestampsRewritten: raw.nativeMemory.receiptClockFence.timestampsRewritten, monitorClosed: raw.nativeMemory.receiptClockFence.monitorClosed },
  suspension: raw.asyncifyStorageFinalSamples, split: raw.splitFinalSamples, inputFailures: raw.inputReadFailureSamples,
  checkpoint: raw.nativeMemory.durableCheckpoint,
  cleanup: Object.fromEntries(Object.entries(raw.cleanup).filter(([key]) => key !== "chromeRootExitObservation")) }, null, 2));
