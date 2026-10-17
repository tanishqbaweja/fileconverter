import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { inspectCompiledCacheObservation } from "../scripts/lib/compiled-cache-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-17T04-01-20-706Z-compiled-cache-control-terminal.json"));
const baseline = JSON.parse(await readFile("evidence/2026-10-17T03-13-05-207Z-save-handoff-control-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path))), build = JSON.parse(await readFile(terminal.build.path));
const oldReport = JSON.parse(gunzipSync(await readFile(baseline.report.path))), oldBuild = JSON.parse(await readFile(baseline.build.path));
test("actual compiled-module reuse fits three startup controls, never claims completed original or speed gain", () => {
  const result = inspectCompiledCacheObservation(terminal, report, build, oldReport, oldBuild);
  assert.deepEqual(result.runs.map(row => row.incrementalPrivateMiB), [178.6171875, 176.35546875, 165.1796875]);
  assert.equal(result.phases[0].incrementalPrivateMiB, 241.26953125);
  assert.equal(result.completedOriginalConversions, 0); assert.equal(result.warmCompleteOutputValidated, false);
  assert.equal(result.speedGainProven, false); assert.equal(result.publicAcceptance, false);
});
test("reject sample omissions, excess budget, shared memories, altered outputs and unobserved reuse", () => {
  for (const mutate of [r => { r.progressProbe.compiledCacheEvents.pop(); r.progressProbe.compiledCacheEvents.pop(); },
    r => { r.nativeMemory.phases.find(row => row.phase === "conversion-2").unavailableSamples++; },
    r => { r.blankBaseline.privateBytes = r.startupSettlement.earlyWindow.privateBytes + 1; },
    r => { r.progressProbe.successfulSaveControl.rows.find(row => row.outputCodec === "mpeg2video").outputSha256 = "0".repeat(64); },
    r => { r.runs[0].startupControl.fullOutputValidationPerformed = true; }]) {
    const copy = structuredClone(report); mutate(copy);
    assert.throws(() => inspectCompiledCacheObservation(terminal, copy, build, oldReport, oldBuild));
  }
  for (const key of ["wasmMemoriesSharedAcrossJobs", "instancesShared", "progressSamplingChanged"]) {
    assert.throws(() => inspectCompiledCacheObservation(terminal, report, { ...build, [key]: true }, oldReport, oldBuild));
  }
});
