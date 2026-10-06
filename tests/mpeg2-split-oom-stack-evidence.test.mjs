import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
test("Actual original failure stack proves decoded-frame buffer path from binary names, not a completed conversion", async () => {
  const root = new URL("../", import.meta.url);
  const p = JSON.parse(await readFile(new URL("evidence/mpeg2-split-oom-stack-measured-2026-10-06.json", root), "utf8"));
  assert.equal(p.actualNativeCallPathProven, true); assert.equal(p.underlyingAllocationCapacityOrFragmentationProven, false);
  for (const field of ["publicAcceptance", "completeChromiumMemoryAcceptance", "completedConversion", "comparableSpeedBenchmark"])
    assert.equal(p[field], false);
  assert.equal(p.completedRuns, 0); assert.equal(p.requestedRuns, 1); assert.equal(p.independentValidation, null);
  assert.equal(p.wasm.sha256, "7b8a42b60efc439f0ceca045f4caaabfd4b0ebf0706397b6011cceedada4980c");
  assert.equal(p.wasm.actualBinaryFunctionNames, 4655);
  const frames = p.nativeFramesFromActualBinary.map(frame => frame.functionNameFromActualBinary);
  assert.equal(frames.length, 15);
  assert.ok(frames.indexOf("av_buffer_allocz") < frames.indexOf("avcodec_default_get_buffer2"));
  assert.ok(frames.includes("alloc_frame") && frames.includes("hevc_receive_frame"));
  assert.ok(!frames.includes("av_refstruct_pool_get"));
  assert.equal(p.allocation.currentDecoderHeapBytes, 33554432); assert.equal(p.allocation.requestedTotalHeapBytes, 33779712);
  for (const field of ["requestedPlaneBufferBytes", "liveFrameCount", "largestFreeBlockBytes", "cachedPlaneBytes"])
    assert.equal(p.allocation[field], null);
  assert.equal(p.nativeEncoderOwnership[0].frames, 243); assert.equal(p.nativeEncoderOwnership[0].closed, true);
  assert.equal(p.nativeEncoderOwnership[0].activePackets, 0);
  assert.equal(p.cleanup.errors, undefined); assert.equal(p.independentlyVerifiedRuntimeAndPidAbsence, true);
  assert.equal(p.generatedAssetsRestoredAndDiagnosticRemoved, true); assert.equal(p.source.independentlyVerifiedAfter, true);
  assert.equal(p.incrementalPrivateMiBIncomplete, (p.actualCompleteNativePeak.privateBytes - p.blankBaseline.privateBytes) / 1048576);
  assert.equal(p.actualCompleteNativePeak.processes.reduce((sum, row) => sum + row.privateBytes, 0), p.actualCompleteNativePeak.privateBytes);
  for (const [file, hash] of Object.entries(p.sourcePins))
    assert.equal(createHash("sha256").update(await readFile(new URL(file, root))).digest("hex"), hash, file);
});

test("Actual split linker/component audit does not invent available heap or usable allocation savings", async () => {
  const root = new URL("../", import.meta.url);
  const p = JSON.parse(await readFile(new URL("evidence/mpeg2-split-static-layout-2026-10-06.json", root), "utf8"));
  assert.equal(p.originalRead, false); assert.equal(p.conversionsPerformed, 0);
  assert.equal(p.publicAcceptance, false); assert.equal(p.completeChromiumMemoryAcceptance, false);
  assert.deepEqual(p.rows.map(row => row.passiveDataPayloadBytes), [385131, 142665]);
  assert.deepEqual(p.rows.map(row => row.codeSectionBytes), [6387878, 527648]);
  assert.deepEqual(p.rows.map(row => row.stackEnd), [1920000, 468144]);
  for (const row of p.rows) {
    assert.equal(row.stackBase - row.stackEnd, 262144); assert.equal(row.importCallbacks, 0);
    for (const field of ["heapBase", "availableHeapBytes", "freeBlocks", "liveFrameBytes", "runtimeHeapSavingsBytes"])
      assert.equal(row[field], null);
    assert.equal(row.completeChromiumMemoryAcceptance, false);
  }
  assert.equal(createHash("sha256").update(await readFile(new URL(p.source.file, root))).digest("hex"), p.source.sha256);
});
