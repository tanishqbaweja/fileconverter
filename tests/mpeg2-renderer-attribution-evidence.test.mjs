import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const proof = JSON.parse(await read("evidence/mpeg2-renderer-attribution-2026-10-06.json"));
test("Attribution preserves gate-trigger and higher final phase peaks including tracing-service bytes", () => {
  assert.equal(proof.gateTriggerIncrementalPrivateMiB, 253.60546875);
  assert.equal(proof.finalConversionPhasePeak.privateBytes, 508932096);
  assert.equal(proof.finalConversionPhasePeak.processes.length, 10);
  assert.equal(proof.finalConversionPhasePeak.processes.reduce((sum, process) => sum + process.privateBytes, 0), 508932096);
  assert.equal(proof.finalConversionPhaseIncrementalPrivateMiB, (508932096 - 236724224) / 1048576);
  assert.ok(proof.finalConversionPhaseIncrementalPrivateMiB > proof.gateTriggerIncrementalPrivateMiB);
  assert.equal(proof.completeChromiumMemoryAcceptance, false); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.completeOriginalConversion, false); assert.equal(proof.instrumentedMemoryAndTiming, true);
});
test("Measured main-thread Blink growth is a lead, not proof of a particular object or causal fix", () => {
  assert.equal(proof.rendererRows[0].process.allocators["blink_gc/main"].size, 17039440);
  assert.equal(proof.rendererRows[1].process.allocators["blink_gc/main"].size, 60162128);
  assert.equal(proof.realmSamples.count, 327); assert.equal(proof.trace.events, 825);
  assert.equal(proof.trace.serializedBytes, 3157576); assert.equal(proof.trace.dataLossOccurred, false);
  assert.equal(proof.trace.overflow, false); assert.equal(proof.allocationObjectOrCallSite, null);
  assert.equal(proof.causalFixProven, false);
  assert.ok(proof.realmPeaks.find(realm => realm.type === "worker").peaks.usedJSHeapBytes.bytes < 3 * 1048576);
  for (const row of proof.allAllocatorRows) assert.equal(row.summedAllocatorTotal, null);
});
test("Original-source, executed helper hashes and all cleanup claims remain exact", async () => {
  for (const [file, digest] of Object.entries(proof.sourcePins))
    assert.equal(createHash("sha256").update(await read(file)).digest("hex"), digest, file);
  assert.equal(proof.source.bytes, 2958573265);
  assert.equal(proof.source.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.splitFinalSamples[0].frames, 1181); assert.equal(proof.splitFinalSamples[0].completedPackets, 1181);
  assert.equal(proof.cleanup.conversionQuiescence.terminalState, "cancelled");
  for (const key of ["mediaProfileRuntimeRemoved", "generatedDistRestored", "protectedFixtureUnchanged", "observerStopped", "sampledChromeRootStopped"])
    assert.equal(proof.cleanup[key], true);
  assert.deepEqual(proof.forbiddenRequests, []);
});
