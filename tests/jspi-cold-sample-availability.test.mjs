import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { inspectColdSampleAvailability } from "../scripts/lib/jspi-cold-sample-availability.mjs";
import { coldFullObservationDerivation } from "../scripts/lib/jspi-cold-full-observation.mjs";
const terminal = JSON.parse(await readFile("evidence/2026-10-19T18-08-46-161Z-jspi-ssim-full-terminal.json"));
const report = JSON.parse(gunzipSync(await readFile(terminal.report.path)));
test("actual isolated OS failures remain null, counts reconcile, and two missing CIM reads have uninterrupted native coverage", () => {
  const value = inspectColdSampleAvailability(report);
  assert.equal(value.acquisitionCount, 504917); assert.equal(value.unavailableSamples, 4);
  assert.deepEqual(value.perRun.map(row => row.unavailableSamples), [0,1,0]);
  assert.equal(value.unavailableCimRetained.length, 2);
  assert.equal(value.noSyntheticSamplesOrZeroFill, true);
});
test("zero fill, omitted error/count, failed boundary, missing independent coverage or observer failure is rejected", () => {
  for (const mutate of [
    value => { value.nativeMemory.phases.find(row => row.unavailableSamples).unavailableExamples[0][3] = 0; },
    value => { value.nativeMemory.phases.find(row => row.unavailableSamples).unavailableExamples = []; },
    value => { const row = value.nativeMemory.phases.find(row => row.unavailableSamples); row.unavailableExamples[0][0] = row.firstSequence; },
    value => { value.nativeFailureCapture.unavailableSamples = 0; },
    value => { value.samples.find(row => row.privateBytes == null).privateBytes = 0; },
    value => { value.nativeMemory.error = "observer stopped"; },
  ]) { const changed = structuredClone(report); mutate(changed); assert.throws(() => inspectColdSampleAvailability(changed)); }
});
test("cold inspector reverses exactly to the unchanged historical inspector, retaining every content/memory/cleanup assertion", async () => {
  const restored = coldFullObservationDerivation.edits.toReversed().reduce((text, [before, after]) => text.replace(after, before), coldFullObservationDerivation.generated);
  assert.equal(restored, await readFile("scripts/lib/jspi-three-full-observation.mjs", "utf8"));
  assert.equal(coldFullObservationDerivation.edits.length, 4);
});
