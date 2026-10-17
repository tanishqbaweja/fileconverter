import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { inspectJspiBrowserResult } from "../scripts/lib/jspi-browser-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-17T22-38-25-691Z-jspi-control-terminal.json"));
const previous = JSON.parse(await readFile("evidence/2026-10-17T18-26-10-502Z-catalogue-slot-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path))), previousReport = JSON.parse(gunzipSync(await readFile(previous.report.path)));
const build = JSON.parse(await readFile(terminal.build.path)), previousBuild = JSON.parse(await readFile(previous.build.path));
test("actual six genuine outputs and all fault recoveries satisfy the unchanged full-tree small-fixture gate", () => {
  const analysis = inspectJspiBrowserResult(terminal, report, previousReport, build, previousBuild);
  assert.equal(analysis.completedSmallOutputs, 6); assert.ok(analysis.peakIncrementalPrivateMiB <= 250);
  assert.equal(analysis.completedOriginalConversions, 0); assert.equal(analysis.speedGainProven, false); assert.equal(analysis.publicAcceptance, false);
});
test("missing recovery, altered packet proof, omitted GPU or larger denominator fails independently", () => {
  for (const mutate of [
    value => { value.progressProbe.successfulSaveControl.rows = value.progressProbe.successfulSaveControl.rows.filter(row => row.kind !== "validated-same-page-recovery"); },
    value => { value.progressProbe.successfulSaveControl.rows.find(row => row.kind === "independent-packet-order-proof").packets[0].size = "1"; },
    value => { for (const sample of value.samples) sample.processes = sample.processes.filter(row => row.type !== "gpu-process"); },
    value => { value.blankBaseline.privateBytes += 1048576; },
  ]) { const changed = structuredClone(report); mutate(changed); assert.throws(() => inspectJspiBrowserResult(terminal, changed, previousReport, build, previousBuild)); }
});
