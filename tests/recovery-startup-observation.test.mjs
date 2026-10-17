import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectUntracedStartup } from "../scripts/lib/recovery-startup-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-17T21-16-09-336Z-recovery-runtime-control-terminal.json"));
const previous = JSON.parse(await readFile("evidence/2026-10-17T18-26-10-502Z-catalogue-slot-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path))), build = JSON.parse(await readFile(terminal.build.path));
const oldReport = JSON.parse(gunzipSync(await readFile(previous.report.path))), oldBuild = JSON.parse(await readFile(previous.build.path));
test("failure before trace hook must not become fabricated runtime evidence", () => {
  const result = inspectUntracedStartup(terminal, report, oldReport, build, oldBuild);
  assert.equal(result.completedSmallOutputs, 0); assert.equal(result.traceStarted, false); assert.equal(result.firstNativeBreachMiB, 258.8671875);
});
test("refuse invented trace, successful output or absent worker retirement", () => {
  for (const mutate of [r => { r.progressProbe.recoveryExecution = {}; },
    r => { r.progressProbe.successfulSaveControl.successfulFixtureValidations = 1; },
    r => { r.quiescedBudgetCapture.oldWorkerCloseObserved = false; }]) {
    const copy = structuredClone(report); mutate(copy); assert.throws(() => inspectUntracedStartup(terminal, copy, oldReport, build, oldBuild));
  }
});
