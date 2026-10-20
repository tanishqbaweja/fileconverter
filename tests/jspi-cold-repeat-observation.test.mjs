import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { inspectJspiColdRepeat } from "../scripts/lib/jspi-cold-repeat-observation.mjs";
const previous = JSON.parse(await readFile("evidence/2026-10-18T23-55-28-649Z-jspi-ssim-full-terminal.json"));
const terminal = JSON.parse(await readFile("evidence/2026-10-19T18-08-46-161Z-jspi-ssim-full-terminal.json"));
const previousReport = JSON.parse(gunzipSync(await readFile(previous.report.path))), report = JSON.parse(gunzipSync(await readFile(terminal.report.path)));
test("actual second three-full session uses a later native browser birth and fresh profile with identical sources/binaries/outputs", () => {
  const value = inspectJspiColdRepeat(previous, previousReport, terminal, report);
  assert.equal(value.independentColdSessionRepeatVerified, true); assert.equal(value.completeFullOutputs, 6);
  assert.equal(value.currentWorstIncrementalPrivateMiB, 226.83203125);
  assert.equal(value.zeroRetainedGrowthProven, false); assert.equal(value.publicAcceptance, false); assert.equal(value.scalingAcceptance, false);
});
test("same browser/profile, changed sources/manifest/browser, missing native root or failed full validation cannot become cold evidence", () => {
  const changes = [
    { r: { ...report, runtimeDirectory: previousReport.runtimeDirectory } },
    { t: { ...terminal, sourcePins: { ...terminal.sourcePins, "package.json": "0".repeat(64) } } },
    { r: { ...report, manifest: { ...report.manifest, altered: true } } },
    { r: { ...report, browserVersion: "different" } },
    { r: { ...report, nativeMemory: { ...report.nativeMemory, identities: report.nativeMemory.identities.filter(row => row.pid !== report.cleanup.chromeRootExitObservation.identity.pid) } } },
    { r: { ...report, cleanup: { ...report.cleanup, chromeRootExitObservation: previousReport.cleanup.chromeRootExitObservation } } },
    { r: { ...report, runs: report.runs.map((row, index) => index ? row : { ...row, independentValidation: { ...row.independentValidation, ssim: 0.97 } }) } },
  ];
  for (const change of changes) assert.throws(() => inspectJspiColdRepeat(previous, previousReport, change.t ?? terminal, change.r ?? report));
});
