import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
test("actual changed diagnostic retains full ten-process failed peak and lower same-instance baseline", async () => {
  const p = JSON.parse(await read("evidence/mpeg2-burst-attribution-2026-10-07.json"));
  const peak = p.finalPreConversionAndConversionNativePeak;
  assert.equal(peak.privateBytes, 540237824); assert.equal(peak.processes.length, 10);
  assert.equal(peak.processes.reduce((n, process) => n + process.privateBytes, 0), peak.privateBytes);
  assert.equal(p.blankBaseline.privateBytes, 240594944); assert.equal(p.limitMiB, 250);
  assert.equal((peak.privateBytes - p.blankBaseline.privateBytes) / 1048576, 285.76171875);
  assert.equal(p.finalNativeIncrementalPrivateMiB, 285.76171875);
  assert.ok(p.blankBaseline.privateBytes < p.startupSettlement.earlyWindow.privateBytes);
  assert.equal(p.startupSettlement.baselineInflated, false); assert.equal(p.processesExcluded, 0);
  assert.equal(p.completeChromiumMemoryAcceptance, false); assert.equal(p.completeOriginalConversion, false);
  assert.equal(p.lastPreCancellationMetrics.wasmMemoryBytes, 50331648);
  assert.equal(p.lastPreCancellationMetrics.peakQueuedBytes, 65536);
  assert.equal(p.lastPreCancellationMetrics.peakPendingOperations, 1);
  assert.equal(p.splitFinalSamples[0].frames, 1356); assert.equal(p.splitFinalSamples[0].closed, true);
});
test("fast dump request is not immediate peak attribution; all GUIDs/delays/provider caveats are retained", async () => {
  const p = JSON.parse(await read("evidence/mpeg2-burst-attribution-2026-10-07.json"));
  assert.equal(p.trace.trace.dataLossOccurred, false); assert.equal(p.trace.trace.overflow, false);
  assert.equal(p.nativeBursts.events.length, 4); assert.equal(p.joinedDumps.length, 2);
  assert.equal(p.nativeBursts.eventsDiscarded, 0); assert.equal(p.skippedBurstDumps, 0);
  const late = p.joinedDumps.find(row => row.triggerSequence === 3573);
  assert.equal(late.acquisitionToDumpRequestMs, 94); assert.equal(late.acquisitionToDumpCompletionMs, 4070);
  assert.equal(late.processes.length, 1); assert.equal(late.processes[0].nativeIdentity.pid, 24872);
  assert.equal(late.processes[0].nativeDeltaPrivateBytes, 58884096);
  assert.equal(late.processes[0].traceName, "Renderer"); assert.equal(late.processes[0].matchingBaselineIdentity, true);
  assert.equal(late.processes[0].allocationObjectOrCallsite, null);
  assert.equal(p.originalUninstrumentedFailureCause, null); assert.equal(p.publicAcceptance, false);
  for (const [file, digest] of Object.entries(p.sourcePins)) assert.equal(sha(await read(file)), digest, file);
});
test("immediate root-absence failure is not rewritten by later verified cleanup/source preservation", async () => {
  const p = JSON.parse(await read("evidence/mpeg2-burst-attribution-2026-10-07.json"));
  assert.equal(p.cleanup.sampledChromeRootStopped, false); assert.match(p.cleanup.errors[0], /Owned Chrome root/);
  assert.equal(p.cleanup.conversionQuiescence.terminalState, "cancelled");
  assert.equal(p.sampledProcessIdentitiesIndependentlyAbsent, 23); assert.deepEqual(p.matchingSurvivors, []);
  for (const value of Object.values(p.laterIndependentCleanup)) if (typeof value === "boolean") assert.equal(value, true);
  assert.equal(p.sourceIndependentlyPostHashed, true);
  assert.equal(p.source.bytes, 2958573265);
  assert.equal(p.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(Object.keys(p.restoredAssetPins).length, 6); assert.equal(p.privateAssetsAbsent.length, 9);
});
test("actual summary-only blank control retains heap child metrics and exactly executed generated sources", async () => {
  const p = JSON.parse(await read("evidence/complete-blink-heap-control-2026-10-07.json"));
  assert.equal(p.status, "completed-brief-blink-heap-control"); assert.equal(p.heapFieldsAvailable, true);
  assert.equal(p.noForcedGc, true); assert.equal(p.noTraceModeOrBufferChange, true);
  assert.equal(p.originalRead, false); assert.equal(p.converterLoaded, false); assert.equal(p.conversionsPerformed, 0);
  assert.equal(p.generatedMediaCopies, 0); assert.equal(p.completeChromiumMemoryAcceptance, false);
  assert.equal(p.outerGeneratedRuntimeRemoved, true);
  for (const value of Object.values(p.cleanup)) assert.equal(value, true);
  for (const [name, digest] of Object.entries(p.generatedSourceHashes)) assert.equal(sha(p.generatedSources[name]), digest, name);
  for (const [file, digest] of Object.entries(p.sourcePins)) assert.equal(sha(await read(file)), digest, file);
  assert.ok(p.rendererHeaps.length >= 2);
  for (const h of p.rendererHeaps) {
    assert.equal(h.name, "blink_gc/main/heap"); assert.ok(h.allocatedObjectsBytes <= h.residentBytes);
    assert.equal(h.unallocatedResidentBytes, h.residentBytes - h.allocatedObjectsBytes);
    assert.equal(h.allocationObjectOrCallsite, null); assert.equal(h.summedAllocatorTotal, null);
  }
});
