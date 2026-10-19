import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { inspectLtoBrowserResult, ltoObservationDerivation } from "../scripts/lib/lto-browser-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-19T16-57-21-316Z-lto-control-terminal.json"));
const previous = JSON.parse(await readFile("evidence/2026-10-17T22-38-25-691Z-jspi-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path))), previousReport = JSON.parse(gunzipSync(await readFile(previous.report.path)));
const build = JSON.parse(await readFile(terminal.build.path)), previousBuild = JSON.parse(await readFile(previous.build.path));
test("actual six LTO outputs/all three recoveries pass the original independent small-fixture gate", () => {
  const analysis = inspectLtoBrowserResult(terminal, report, previousReport, build, previousBuild);
  assert.equal(analysis.completedSmallOutputs, 6); assert.ok(analysis.peakIncrementalPrivateMiB <= 250);
  assert.equal(analysis.completedOriginalConversions, 0); assert.equal(analysis.speedGainProven, false); assert.equal(analysis.publicAcceptance, false);
});
test("LTO independent verifier reverses to the unchanged baseline verifier", async () => {
  const restored = ltoObservationDerivation.edits.toReversed().reduce((text, [before, after]) => text.replace(after, before), ltoObservationDerivation.generated);
  assert.equal(restored, await readFile("scripts/lib/jspi-browser-observation.mjs", "utf8"));
  assert.equal(ltoObservationDerivation.edits.length, 4);
});
test("missing recovery, changed bytes/packet proof, missing GPU, larger baseline or queue regression must fail", () => {
  for (const mutate of [
    value => { value.progressProbe.successfulSaveControl.rows = value.progressProbe.successfulSaveControl.rows.filter(row => row.kind !== "validated-same-page-recovery"); },
    value => { value.progressProbe.successfulSaveControl.rows.find(row => row.container === "mp4" && row.status === "passed").outputSha256 = "0".repeat(64); },
    value => { value.progressProbe.successfulSaveControl.rows.find(row => row.kind === "independent-packet-order-proof").packets[0].size = "1"; },
    value => { for (const sample of value.samples) sample.processes = sample.processes.filter(row => row.type !== "gpu-process"); },
    value => { value.blankBaseline.privateBytes += 1048576; },
    value => { value.progressProbe.successfulSaveControl.rows.find(row => row.container === "mp4" && row.status === "passed").metrics.peakPendingOperations = 2; },
  ]) {
    const changed = structuredClone(report); mutate(changed);
    assert.throws(() => inspectLtoBrowserResult(terminal, changed, previousReport, build, previousBuild));
  }
});
