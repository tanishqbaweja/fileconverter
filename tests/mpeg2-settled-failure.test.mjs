import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const proof = JSON.parse(await read("evidence/mpeg2-settled-original-failure-2026-10-06.json"));
test("Settled original failure preserves the lower same-instance blank and all nine peak processes", () => {
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.completeChromiumMemoryAcceptance, false);
  assert.equal(proof.requestedRuns, 3); assert.equal(proof.attemptedRuns, 1);
  assert.equal(proof.incrementalPrivateMiB, 277.97265625); assert.equal(proof.limitMiB, 250);
  const bytes = proof.fullPeak.processes.reduce((sum, process) => sum + process.privateBytes, 0);
  assert.equal(bytes, 533917696); assert.equal(proof.fullPeak.processes.length, 9);
  assert.equal((bytes - proof.blankBaseline.privateBytes) / 1048576, proof.incrementalPrivateMiB);
  assert.equal(proof.blankBaseline.privateBytes, 242442240);
  assert.ok(proof.startupSettlement.actualMs >= 300000);
  assert.ok(proof.blankBaseline.privateBytes < proof.startupSettlement.earlyWindow.privateBytes);
  assert.equal(proof.rendererAttribution.matchingLaterCimIdentity.type, "renderer");
  assert.equal(proof.rendererAttribution.nativePeakProcess.privateBytes, 277508096);
  assert.equal(proof.allocationSource, null);
  assert.equal(proof.processesExcluded, 0); assert.equal(proof.baselineChanged, false);
  assert.equal(proof.heapLimitRaised, false); assert.equal(proof.codecQualityChanged, false);
  for (const pair of proof.peakIdentities) assert.notEqual(pair.cim.utilitySubtype, "on_device_model.mojom.OnDeviceModelService");
});
test("Settled failure retains exact sources, incomplete conversion and confirmed cancellation cleanup", async () => {
  for (const [file, digest] of Object.entries(proof.sourcePins))
    assert.equal(createHash("sha256").update(await read(file)).digest("hex"), digest, file);
  assert.equal(proof.completeOriginalConversion, false); assert.equal(proof.independentCompletedOutputValidation, false);
  assert.equal(proof.splitFinalSamples[0].frames, 1646); assert.equal(proof.splitFinalSamples[0].completedPackets, 1645);
  assert.equal(proof.aggregateWasmMemoryBytes, 50331648);
  assert.equal(proof.cleanup.conversionQuiescence.terminalState, "cancelled");
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
    assert.equal(proof.cleanup[key], true, key);
  assert.deepEqual(proof.forbiddenRequests, []);
});
