import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
const read = file => readFile(new URL(`../${file}`, import.meta.url));
const proof = JSON.parse(await read("evidence/ui-native-allocation-2026-10-06.json"));
test("Real idle UI control measures native DOM growth without starting or simulating a conversion", () => {
  assert.equal(proof.conversionsPerformed, 0); assert.equal(proof.conversionOutputsCreated, 0);
  assert.ok(proof.rows.filter(row => row.jobState !== null).every(row => row.jobState === "idle"));
  assert.deepEqual(proof.observedDeltas, { nodes: 1620, eventListeners: 180, documents: 0, pageEmbedderHeapBytes: 11750432 });
  assert.equal(proof.nativeStackSymbolsResolved, false); assert.equal(proof.originalConversionAllocationCauseProven, false);
  assert.equal(proof.causalFixProven, false); assert.equal(proof.forcedGcUsed, false);
  assert.equal(proof.publicAcceptance, false); assert.equal(proof.completeChromiumMemoryAcceptance, false);
  assert.equal(proof.conversionSpeedAcceptance, false);
});
test("UI control retains the protected original, exact executed sources, privacy and owned cleanup", async () => {
  assert.equal(proof.originalSourceBytes, 2958573265);
  assert.equal(proof.originalSourceSha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  for (const [file, digest] of Object.entries(proof.sourcePins))
    assert.equal(createHash("sha256").update(await read(file)).digest("hex"), digest, file);
  for (const value of Object.values(proof.cleanup)) assert.equal(value, true);
  assert.deepEqual(proof.forbidden, []);
  const source = (await read("scripts/diagnose-ui-native-allocation.mjs")).toString();
  assert.ok(source.includes('assert.equal(state.jobState, "idle"'));
  assert.ok(!/convert-button|collectGarbage|HeapProfiler|setJobState/.test(source));
  assert.ok(source.includes("samplingInterval: 524288, suppressRandomness: false"));
  assert.ok(source.includes("value.profile.samples.length <= 4096"));
});
