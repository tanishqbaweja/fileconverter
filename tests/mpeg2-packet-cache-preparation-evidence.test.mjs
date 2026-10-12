import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makePacketCacheBridge, makePacketCacheKernel } from "../media/ffmpeg/mpeg2-packet-cache-source.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const bytes = await read("evidence/2026-10-12T04-32-59-448Z-mpeg2-packet-cache-source.json"), proof = JSON.parse(bytes);
test("actual preparation joins nine current/pre/post/preimages and reversibly generated packet sources to the failed executed338 closure", async () => {
  assert.equal(sha(bytes), "7104508f077e47a8611d7b34c0f62d8e9f94f5bca9a5be7fb4d00533ed8a052f");
  assert.equal(proof.actual338ExecutedSourcesJoined, true);
  const zipped = await read(proof.archive.path); assert.equal(zipped.length, proof.archive.bytes); assert.equal(sha(zipped), proof.archive.sha256);
  const restored = gunzipSync(zipped, { maxOutputLength: 262144 });
  assert.equal(restored.length, proof.archive.restoredBytes); assert.equal(sha(restored), proof.archive.restoredSha256);
  const payload = JSON.parse(restored); assert.deepEqual(payload.sourcePins, proof.sourcePins); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  assert.equal(Object.keys(proof.sourcePins).length, 9);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await read(file)), hash); assert.equal(sha(Buffer.from(payload.sourcePreimages[file].data, "base64")), hash);
  }
  assert.equal(payload.generatedBridge, makePacketCacheBridge((await read("media/ffmpeg/mpeg2-split-mux-bridge.h")).toString()));
  assert.equal(payload.generatedKernel, makePacketCacheKernel((await read("media/ffmpeg/mpeg2-candidate.c")).toString()));
  assert.equal(sha(payload.generatedBridge), proof.generatedBridgeSha256); assert.equal(sha(payload.generatedKernel), proof.generatedKernelSha256);
  assert.equal(sha(await read(proof.actualFailure.path)), proof.actualFailure.sha256);
});
test("candidate retains bounded fragments and one final-unreferenced variable-size lease but has NO native/browser/memory/speed acceptance", () => {
  assert.equal(proof.status, "private-packet-cache-source-prepared-not-built");
  assert.equal(proof.actualFailure.individualAllocationBytes, null); assert.equal(proof.actualFailure.allocatorInventory, null); assert.equal(proof.actualFailure.failureCauseProven, false);
  assert.equal(proof.candidatePolicy.maximumIdleLeases, 1); assert.equal(proof.candidatePolicy.maximumIdlePayloadBytes, 1048576);
  assert.equal(proof.candidatePolicy.paddingBytes, 64); assert.equal(proof.candidatePolicy.allocateActualRequiredBytes, true);
  assert.equal(proof.candidatePolicy.fixedMaximumAllocationForEveryLivePacket, false); assert.equal(proof.candidatePolicy.heapLimitsRaised, false);
  assert.equal(proof.actualAvBufferCreateFailureDoesNotConsumeDataConfirmedFromExecutedSource, true);
  assert.equal(proof.unchangedFragmentationOptions.fragSizeBytes, 1048576); assert.equal(proof.unchangedFragmentationOptions.fragDurationUs, 1000000);
  assert.equal(proof.browserLaunches, 0); assert.equal(proof.conversions, 0);
  for (const field of ["nativeBuildExecuted", "nativeLifecycleSmokeExecuted", "originalVideoRead", "fullOriginalAcceptance", "memoryAcceptance", "speedGainProven", "publicAcceptance"]) assert.equal(proof[field], false);
});
