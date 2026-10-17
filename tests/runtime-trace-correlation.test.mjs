import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { correlateRuntimeTrace } from "../scripts/lib/runtime-trace-correlation.mjs";
import { inspectColdRecovery } from "../scripts/lib/cold-recovery-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-17T21-30-14-947Z-cold-recovery-control-terminal.json"));
const previous = JSON.parse(await readFile("evidence/2026-10-17T18-26-10-502Z-catalogue-slot-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path))), build = JSON.parse(await readFile(terminal.build.path));
const oldReport = JSON.parse(gunzipSync(await readFile(previous.report.path))), oldBuild = JSON.parse(await readFile(previous.build.path));
const capture = report.progressProbe.coldExecution, trace = JSON.parse(gunzipSync(await readFile(capture.rawArchive.path)));
test("actual unsaturated trace correlates compiler activity with native renderer growth, not invented allocation bytes", () => {
  const analysis = inspectColdRecovery(terminal, report, oldReport, build, oldBuild);
  const result = correlateRuntimeTrace(trace, capture, analysis.firstFailure, analysis.rendererIdentity);
  assert.equal(result.lazyCompileCalls, 767); assert.ok(result.topTierEvents > 0); assert.ok(result.topTierThreads > 1);
  assert.ok(result.topTierPossiblyAtBreach.length > 0); assert.equal(result.allocationCauseProven, false);
  assert.equal(result.allocationBytesAttributed, null); assert.equal(analysis.completedSmallOutputs, 0);
});
test("missing clock marker, contradictory brackets or saturated trace never proves a precise correlation", () => {
  const analysis = inspectColdRecovery(terminal, report, oldReport, build, oldBuild);
  const missing = structuredClone(trace); missing.traceEvents = missing.traceEvents.filter(row => row.name !== "clock_sync");
  assert.throws(() => correlateRuntimeTrace(missing, capture, analysis.firstFailure, analysis.rendererIdentity));
  const saturated = structuredClone(capture); saturated.bufferUsageMaximum = 1;
  assert.throws(() => correlateRuntimeTrace(trace, saturated, analysis.firstFailure, analysis.rendererIdentity));
});
