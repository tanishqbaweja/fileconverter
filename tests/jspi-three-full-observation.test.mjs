import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { inspectThreeFullJspiRuns } from "../scripts/lib/jspi-three-full-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-18T23-55-28-649Z-jspi-ssim-full-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path)));
test("actual three genuine full outputs satisfy the unchanged same-session gates, not cold/scaling/public claims", () => {
  const result = inspectThreeFullJspiRuns(terminal, report);
  assert.equal(result.rows.length, 3); assert.equal(result.worstIncrementalPrivateMiB, 223.6484375);
  assert.equal(result.sameSessionThreeRunsVerified, true); assert.equal(result.newColdSessionRepeatVerified, false);
  assert.equal(result.scalingAcceptance, false); assert.equal(result.publicAcceptance, false);
});
test("fabricated quality, changed bytes, larger blank, missing GPU and missing cleanup recovery fail", () => {
  for (const mutate of [
    value => { value.runs[0].independentValidation.ssim = 0.97; },
    value => { value.runs[1].independentValidation.sha256 = "0".repeat(64); },
    value => { value.blankBaseline.privateBytes += 1; },
    value => { for (const sample of value.samples) if (sample.processes) sample.processes = sample.processes.filter(row => row.type !== "gpu-process"); },
    value => { value.runs[2].recovery.stable = false; },
  ]) { const changed = structuredClone(report); mutate(changed); assert.throws(() => inspectThreeFullJspiRuns(terminal, changed)); }
});
