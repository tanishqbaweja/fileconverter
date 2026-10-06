import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const proof = JSON.parse(await read("evidence/mpeg2-static-ui-original-failure-2026-10-07.json"));
test("Static UI reuse does not turn a late native original memory failure into acceptance", () => {
  assert.equal(proof.status, "failed-strict-original-memory-after-static-ui-reuse");
  assert.equal(proof.incrementalPrivateMiB, 260.52734375); assert.equal(proof.limitMiB, 250);
  assert.equal(proof.fullPeak.privateBytes, 507424768); assert.equal(proof.blankBaseline.privateBytes, 234242048);
  assert.equal(proof.fullPeak.processes.length, 9);
  assert.equal(proof.fullPeak.processes.reduce((sum, process) => sum + process.privateBytes, 0), proof.fullPeak.privateBytes);
  assert.equal((proof.fullPeak.privateBytes - proof.blankBaseline.privateBytes) / 1048576, proof.incrementalPrivateMiB);
  assert.ok(proof.blankBaseline.privateBytes < proof.startupSettlement.earlyWindow.privateBytes);
  assert.ok(proof.startupSettlement.actualMs >= 300000); assert.equal(proof.startupSettlement.flagsChanged, false);
  assert.equal(proof.requestedRuns, 3); assert.equal(proof.attemptedRuns, 1); assert.equal(proof.completedRuns, 0);
  assert.equal(proof.nativeUnavailableSamples, 0); assert.ok(proof.nativeValidSamples > 30000);
  for (const key of ["publicAcceptance", "completeOriginalConversion", "completeChromiumMemoryAcceptance", "independentCompletedOutputValidation",
    "fullOriginalAudioValidation", "baselineChanged", "codecQualityChanged", "heapLimitRaised", "conversionSpeedAcceptance"]) assert.equal(proof[key], false, key);
  assert.equal(proof.processesExcluded, 0); assert.equal(proof.uiCpuImprovementRetained, true);
});
test("Native peak renderer identity is retained without guessing a late-sampled allocation cause", () => {
  assert.equal(proof.rendererAttribution.nativePeakProcess.pid, 38208);
  assert.equal(proof.rendererAttribution.nativePeakProcess.privateBytes, 255291392);
  assert.equal(proof.rendererAttribution.matchingLaterCimIdentity.type, "renderer");
  assert.equal(proof.rendererAttribution.matchingLaterCimIdentity.privateBytes, 201478144);
  assert.ok(Date.parse(proof.rendererAttribution.laterSampleTimestamp) > Date.parse(proof.fullPeak.timestamp));
  assert.equal(proof.allocationSource, null);
  for (const pair of proof.peakIdentities) {
    assert.equal(pair.native.pid, pair.cim.pid); assert.equal(pair.native.parentPid, pair.cim.parentPid);
    assert.ok(Math.abs(Date.parse(pair.native.createdAt) - Date.parse(pair.cim.createdAt)) < 1);
    assert.notEqual(pair.cim.utilitySubtype, "on_device_model.mojom.OnDeviceModelService");
  }
});
test("Late rejection keeps fixed queues/heaps, actual cancellation cleanup and zero full audio certification", async () => {
  for (const [file, digest] of Object.entries(proof.sourcePins)) assert.equal(createHash("sha256").update(await read(file)).digest("hex"), digest, file);
  assert.equal(proof.aggregateWasmMemoryBytes, 50331648); assert.equal(proof.lastPreCancellationMetrics.peakWasmMemoryBytes, 50331648);
  assert.equal(proof.lastPreCancellationMetrics.peakQueuedBytes, 65536); assert.equal(proof.lastPreCancellationMetrics.peakPendingOperations, 1);
  assert.equal(proof.lastPreCancellationMetrics.maxReadChunkBytes, 65536); assert.equal(proof.lastPreCancellationMetrics.maxWriteChunkBytes, 65536);
  assert.equal(proof.splitFinalSamples[0].frames, 97772); assert.equal(proof.splitFinalSamples[0].completedPackets, 97771);
  assert.equal(proof.splitFinalSamples[0].failed, true); assert.equal(proof.splitFinalSamples[0].closed, true);
  assert.equal(proof.cleanup.conversionQuiescence.terminalState, "cancelled");
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
    assert.equal(proof.cleanup[key], true, key);
  assert.equal(Object.keys(proof.restoredAssetPins).length, 6); assert.equal(proof.privateAssetsAbsent.length, 9);
  assert.equal(proof.supplementalAudio.status, "incomplete-original-audio-supplement");
  assert.equal(proof.supplementalAudio.completedOutputsValidated, 0); assert.equal(proof.supplementalAudio.driver.terminalObserved, true);
  assert.equal(proof.supplementalAudio.guardPolls, 0); assert.equal(proof.supplementalAudio.cleanup.ownedRuntimeRemoved, true);
  assert.equal(proof.supplementalAudio.cleanup.ownedNativeReadersAbsent, true); assert.deepEqual(proof.forbiddenRequests, []);
});
