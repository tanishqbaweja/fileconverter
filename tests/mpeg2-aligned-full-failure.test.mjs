import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const proof = JSON.parse(await read("evidence/mpeg2-aligned-full-failure-2026-10-06.json"));
test("Full original failure counts the on-device utility and all other Chromium descendants", () => {
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.completeChromiumMemoryAcceptance, false);
  assert.equal(proof.requestedRuns, 3); assert.equal(proof.attemptedRuns, 1);
  assert.equal(proof.incrementalPrivateMiB, 469.39453125); assert.equal(proof.limitMiB, 250);
  const bytes = proof.fullPeak.processes.reduce((sum, process) => sum + process.privateBytes, 0);
  assert.equal(bytes, proof.fullPeak.privateBytes);
  assert.equal((bytes - proof.blankBaseline.privateBytes) / 1048576, proof.incrementalPrivateMiB);
  assert.equal(proof.newChildAttribution.nativePeakProcess.privateBytes, 292614144);
  assert.equal(proof.newChildAttribution.matchingCimIdentity.utilitySubtype, "on_device_model.mojom.OnDeviceModelService");
  assert.equal(proof.processesExcluded, 0); assert.equal(proof.baselineChanged, false);
  assert.equal(proof.heapLimitRaised, false); assert.equal(proof.codecQualityChanged, false);
});
test("Protected original and tested source hashes remain exact, partial output/cancellation is not completion", async () => {
  for (const [file, digest] of Object.entries(proof.sourcePins))
    assert.equal(createHash("sha256").update(await read(file)).digest("hex"), digest, file);
  assert.equal(proof.completeOriginalConversion, false); assert.equal(proof.independentCompletedOutputValidation, false);
  assert.equal(proof.splitFinalSamples[0].frames, 5802); assert.equal(proof.splitFinalSamples[0].completedPackets, 5802);
  assert.equal(proof.cleanup.conversionQuiescence.terminalState, "cancelled");
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
    assert.equal(proof.cleanup[key], true, key);
  assert.deepEqual(proof.forbiddenRequests, []);
});
