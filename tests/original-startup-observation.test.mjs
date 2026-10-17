import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectOriginalStartupObservation } from "../scripts/lib/original-startup-observation.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const terminal = JSON.parse(await read("evidence/2026-10-17T02-01-05-994Z-original-startup-terminal.json"));
const report = JSON.parse(gunzipSync(await read(terminal.report.path), { maxOutputLength: 33554432 }));
test("actual original startup result never becomes completed full conversions", () => {
  const result = inspectOriginalStartupObservation(terminal, report);
  assert.equal(result.completedConversions, 0); assert.equal(result.fullOriginalAcceptance, false);
  assert.deepEqual(result.runs.map(run => run.incrementalPrivateMiB), [231.77734375, 225.28515625, 242.5390625]);
  const phases = report.nativeMemory.phases.filter(phase => /^conversion-[123]$/.test(phase.phase));
  assert.deepEqual(phases.map(phase => phase.validSamples), [105, 107, 104]);
  for (const [index, phase] of phases.entries()) {
    assert.equal(phase.unavailableSamples, 0);
    // Finalized phases include cancellation samples arriving after loop exit.
    // They must not hide a higher peak than the run's earlier snapshot.
    assert.equal(phase.peak[3], report.runs[index].peakPrivateBytes);
  }
});
test("reject fabricated completion, weakened memory, native samples and cancellation proof", () => {
  for (const mutate of [
    r => { r.runs[0].independentValidation = { fullDecode: true }; },
    r => { r.limitMiB = 300; },
    r => { r.runs[0].nativePeaks.unavailableSamples = 1; },
    r => { r.runs[0].startupControl.cancellation.terminalState = "complete"; },
    r => { r.blankBaseline.privateBytes += 1048576; },
    r => { r.runs[0].nativePeaks.peak.processes.pop(); },
    r => { r.runs[0].startupControl.beforeCancellation.metrics.outputBytes = 0; },
  ]) { const copy = structuredClone(report); mutate(copy); assert.throws(() => inspectOriginalStartupObservation(terminal, copy)); }
});
