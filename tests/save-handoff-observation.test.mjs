import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectSaveHandoffObservation } from "../scripts/lib/save-handoff-observation.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const rows = await Promise.all(["2026-10-17T03-01-12-135Z", "2026-10-17T03-13-05-207Z"].map(async stamp => {
  const terminal = JSON.parse(await read(`evidence/${stamp}-save-handoff-control-terminal.json`));
  return { terminal, report: JSON.parse(gunzipSync(await read(terminal.report.path))) };
}));
test("distinguish automation-input failure from a genuinely completed fixture plus original startup breach", () => {
  const first = inspectSaveHandoffObservation(rows[0].terminal, rows[0].report, false);
  const second = inspectSaveHandoffObservation(rows[1].terminal, rows[1].report, true);
  assert.equal(first.successfulFixtureValidations, 0); assert.equal(second.successfulFixtureValidations, 1);
  assert.equal(second.firstBudgetFailureMiB, 250.4765625);
  assert.equal(second.fixture.incrementalPrivateMiB, 237.9453125);
  assert.equal(second.completedOriginalConversions, 0); assert.equal(second.fullOriginalAcceptance, false);
});
test("refuse changed quality, materialized input, lost processes or invented original success", () => {
  for (const mutate of [r => { r.progressProbe.successfulSaveControl.provenance.nativeDiskFilePickerBypass = false; },
    r => { r.progressProbe.successfulSaveControl.rows.find(row => row.container === "mp4" && row.status === "passed").ssim = 0.8; },
    r => { r.nativeFailureCapture.firstFailure.after.processes.pop(); },
    r => { r.runs[1].independentValidation = { fullDecode: true }; },
    r => { r.quiescedBudgetCapture.stateBefore.metrics.inputBytes = 0; },
  ]) { const copy = structuredClone(rows[1].report); mutate(copy); assert.throws(() => inspectSaveHandoffObservation(rows[1].terminal, copy, true)); }
});
