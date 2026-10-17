// Static, source-bound artifact comparison only. Never runs a media conversion.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.resolve(root, file));
const currentProofPath = "evidence/mpeg2-jspi-build-39072949964.json", parentProofPath = "evidence/mpeg2-duration-drain-build-38678806473.json";
const currentBytes = await read(currentProofPath), parentBytes = await read(parentProofPath);
const current = JSON.parse(currentBytes), parent = JSON.parse(parentBytes);
assert.equal(current.status, "actual-jspi-build-unit-verified-not-browser-acceptance");
assert.equal(current.run.conclusion, "success"); assert.equal(current.hostedCleanupStepPassed, true); assert.equal(current.downloadRuntimeRemoved, true);
for (const record of [current, parent]) {
  assert.equal(path.dirname(record.reusableToolDirectory), path.join(root, "work")); assert.ok(record.files.length <= 20);
  for (const file of record.files) {
    const bytes = await read(path.join(record.reusableToolDirectory, file.file));
    assert.equal(bytes.length, file.bytes); assert.equal(sha(bytes), file.sha256);
  }
  assert.deepEqual(JSON.parse(await read(path.join(record.reusableToolDirectory, "build-manifest.json"))), record.manifest);
}
assert.deepEqual(current.manifest.memories, parent.manifest.memories); assert.equal(current.manifest.aggregateWasmMemoryBytes, 50331648);
const changedCommonSources = Object.keys(parent.manifest.sources).filter(file => current.manifest.sources[file] !== parent.manifest.sources[file]);
assert.deepEqual(changedCommonSources, [".github/workflows/reproduce-ffmpeg-nondocker.yml"]);
for (const file of ["split-encoder.wasm", "split-encoder.mjs", "config_components.h"]) {
  assert.deepEqual(await read(path.join(current.reusableToolDirectory, file)), await read(path.join(parent.reusableToolDirectory, file)));
}
for (const field of ["generatedKernel", "generatedMuxBridge"]) {
  assert.equal(typeof current.manifest.packetCache[field], "string"); assert.ok(current.manifest.packetCache[field].length > 100);
  assert.equal(current.manifest.packetCache[field], parent.manifest.packetCache[field]);
}
for (const field of ["parentDrainKernelSha256", "originalKernelSha256"]) {
  assert.match(current.manifest.packetDurationBoundary[field], /^[a-f0-9]{64}$/);
  assert.equal(current.manifest.packetDurationBoundary[field], parent.manifest.packetDurationBoundary[field]);
}
const artifacts = [];
for (const file of ["within-mpeg2-split.wasm", "within-mpeg2-split.mjs"]) {
  const before = await read(path.join(parent.reusableToolDirectory, file)), after = await read(path.join(current.reusableToolDirectory, file));
  if (file.endsWith(".wasm")) assert.deepEqual(readWasmMemoryLimits(after), readWasmMemoryLimits(before));
  artifacts.push({ file, before: { bytes: before.length, sha256: sha(before) }, after: { bytes: after.length, sha256: sha(after) },
    smallerBytes: before.length - after.length, smallerPercent: (before.length - after.length) / before.length * 100 });
}
const ownSource = await read("scripts/verify-jspi-native-comparison.mjs");
const output = "evidence/2026-10-18-jspi-native-static-comparison.json";
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), status: "verified-static-artifact-comparison-only",
  current: { path: currentProofPath, sha256: sha(currentBytes) }, parent: { path: parentProofPath, sha256: sha(parentBytes) },
  artifacts, commonNativeSourcePinsEqualExceptPrivateWorkflow: true, kernelAndMuxBridgeEqual: true, separateEncoderByteIdentical: true,
  fixedWasmLimitsIdentical: true, engineManagedStackMemoryBytes: null, runtimePrivateMemorySavedBytes: null,
  browserConversionSpeedGainPercent: null, conversionsPerformed: 0, qualityVerified: false, publicAcceptance: false,
  ownSource: { sha256: sha(ownSource), preimage: ownSource.toString("base64") } }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, artifacts, publicAcceptance: false }));
