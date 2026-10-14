import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmMemoryLimits } from "../scripts/lib/wasm-memory-limits.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
test("actual 93-source native closure retains all executed preimages and current hashes, no dropped parent sources", async () => {
  const proof = JSON.parse(await read("evidence/ebml-reuse-native-38608791023.json"));
  const compressed = await read(proof.archive.path); assert.equal(sha(compressed), proof.archive.sha256);
  const raw = gunzipSync(compressed, { maxOutputLength: 2097152 }); assert.equal(sha(raw), proof.archive.restoredSha256);
  const archive = JSON.parse(raw);
  assert.equal(proof.sourceCount, 93); assert.equal(Object.keys(archive.sourcePins).length, 93);
  assert.deepEqual(archive.sourcePins, proof.sourcePins); assert.deepEqual(proof.currentSourcePins, proof.postSourcePins);
  for (const [file, expected] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data, "base64")), expected);
    assert.equal(sha(await read(file)), proof.currentSourcePins[file]);
  }
});
test("actual candidate fixed 32MiB binary/typed ABI are new, static binding is not browser fatal-hook qualification", async () => {
  const proof = JSON.parse(await read("evidence/ebml-reuse-native-38608791023.json"));
  const bytes = await read("work/mpeg2-ebml-reuse-38608791023/within-mpeg2-split.wasm");
  assert.equal(sha(bytes), "7037563225465b6bff6f3f17eccc9a2f42033e435d3473101efb631b6736fe25");
  assert.deepEqual(readWasmMemoryLimits(bytes), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.equal(proof.layout.within_realloc_attempt_words.address, 1918912);
  assert.equal(proof.functions.find(row => row.name === "within_ebml_release").functionIndex, 227);
  assert.equal(proof.functions.find(row => row.name === "av_buffer_realloc").functionIndex, 4193);
  assert.equal(proof.functions.find(row => row.name === "emscripten_builtin_malloc").functionIndex, 4438);
  assert.equal(proof.constructorStaticBindingVerified, true); assert.equal(proof.runtimeBrowserHookQualified, false);
  assert.equal(proof.fullOriginalCompleted, false); assert.equal(proof.memoryAcceptance, false);
});
test("real Wasm 200000 reuse/content/alias/failure controls pass; 20000 matched requests use one new payload, timings are no speed evidence", async () => {
  const proof = JSON.parse(await read("evidence/ebml-reuse-native-38608791023.json"));
  const result = proof.actualEbmlReuse.actualWasmLibavutil;
  assert.equal(result.reuseIterations, 200000); assert.equal(result.maximumIdleLeases, 1);
  assert.equal(result.maximumIdleCapacityBytes, 1048640); assert.equal(result.injectedFailureCases, 4);
  for (const field of ["logicalSizesPreserved", "aliasesAndDeferredClose", "existingReallocContentPreserved",
    "oversizedAndZeroDelegate", "ownedAllocationsBalanced"]) assert.equal(result[field], true);
  assert.equal(result.matchedWorkloadRounds, 20000); assert.equal(result.upstreamInitialRequests, 20000);
  assert.equal(result.candidatePayloadAllocationCalls, 1); assert.equal(result.candidatePayloadAllocatedBytes, 273954);
  assert.equal(result.candidateElapsedMs, 0); assert.equal(result.controlElapsedMs, 0);
  assert.equal(result.conversionSpeedGainProven, false); assert.equal(result.conversionsPerformed, 0);
  assert.equal(proof.browserConversions, 0); assert.equal(proof.publicAcceptance, false);
});
test("failed collector remains frozen and attributable; corrected collector verifies same successful build without rebuilding", async () => {
  const failed = JSON.parse(await read("evidence/ebml-reuse-build-collector-38608791023.json"));
  const corrected = JSON.parse(await read("evidence/ebml-reuse-build-collector-v2-38608791023.json"));
  assert.ok(failed.failure.includes("Cannot access 'smoke' before initialization"));
  assert.equal(failed.ownedRuntimeRemoved, true); assert.equal(corrected.failure, null);
  assert.equal(corrected.nativeBuildChanged, false); assert.equal(corrected.ownedRuntimeRemoved, true);
  for (const [file, expected] of Object.entries(failed.sourcePins))
    assert.equal(sha(Buffer.from(failed.sourcePreimages[file], "base64")), expected);
});
