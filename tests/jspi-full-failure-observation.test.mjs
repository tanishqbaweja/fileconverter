import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { inspectJspiFullFailure } from "../scripts/lib/jspi-full-failure-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-18T02-18-29-564Z-jspi-full-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path)));
test("actual full encode is distinguished from failed SSIM validation, repeatability and quality acceptance", () => {
  const result = inspectJspiFullFailure(terminal, report);
  assert.equal(result.browserCompletedRuns, 1); assert.equal(result.fullyValidatedRuns, 0);
  assert.equal(result.outputBytes, 6414309978); assert.equal(result.peakIncrementalPrivateMiB, 234.2109375);
  assert.equal(result.ssim, null); assert.equal(result.outputSha256, null); assert.equal(result.fullOriginalAcceptance, false);
});
test("missing GPU, inflated denominator, failed lifecycle or fabricated quality must fail the audit", () => {
  for (const mutate of [
    value => { for (const sample of value.samples) sample.processes = sample.processes.filter(row => row.type !== "gpu-process"); },
    value => { value.blankBaseline.privateBytes += 1; },
    value => { value.runs[0].jspiLifecycle.failedCalls = 1; },
    value => { value.runs[0].independentSsimDiagnostic.score = 0.99; },
  ]) { const changed = structuredClone(report); mutate(changed); assert.throws(() => inspectJspiFullFailure(terminal, changed)); }
});
