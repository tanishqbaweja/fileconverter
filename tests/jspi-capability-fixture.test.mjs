import assert from "node:assert/strict";
import test from "node:test";
import { exerciseJspiCapability } from "../scripts/lib/jspi-capability-fixture.mjs";
test("arithmetic JSPI fixture stays self-contained, bounded and independent of media", async () => {
  const source = exerciseJspiCapability.toString();
  assert.doesNotMatch(source, /fetch|File|Blob|arrayBuffer|Atomics|memory|ffmpeg|Asyncify|gc\(/i);
  if (typeof WebAssembly.Suspending !== "function") {
    await assert.rejects(exerciseJspiCapability(), /Stable JSPI APIs unavailable/); return;
  }
  const result = await exerciseJspiCapability();
  assert.deepEqual(result, { moduleBytes: 56, calls: 131, checksum: 16384, delayedResult: 83,
    peakPending: 1, promiseRejectionPropagated: true, synchronousThrowPropagated: true,
    repeatedCalls: 128, noExperimentalFlagsRequired: true, conversions: 0 });
});
