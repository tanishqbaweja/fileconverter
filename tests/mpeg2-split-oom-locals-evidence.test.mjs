import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import test from "node:test";
const root = new URL("../", import.meta.url);
const proof = JSON.parse(await readFile(new URL("evidence/mpeg2-split-oom-locals-measured-2026-10-06.json", root), "utf8"));
test("Original failed plane request is actual-binary corroborated, not heap end or acceptance", () => {
  assert.equal(proof.requestedPlaneBufferBytes, 1597463); assert.equal(proof.requestedTotalHeapBytes, 33779712);
  assert.notEqual(proof.requestedPlaneBufferBytes, proof.requestedTotalHeapBytes);
  for (const name of ["av_malloc", "av_buffer_allocz"]) {
    const frame = proof.nativeFrames.find(frame => frame.functionName === name);
    assert.equal(frame.locals.find(local => local.name === "$var0").value, proof.requestedPlaneBufferBytes);
    const metadata = proof.actualBinary.selectedFunctionMetadata.find(entry => entry.name === name);
    assert.deepEqual(metadata.params, ["i32"]); assert.deepEqual(metadata.results, ["i32"]);
    assert.ok(metadata.bodyStart <= frame.codeOffset && frame.codeOffset < metadata.bodyEnd);
  }
  for (const field of ["publicAcceptance", "completeChromiumMemoryAcceptance", "completedConversion", "comparableSpeedBenchmark",
    "capacityOrFragmentationCauseProven", "allocationSucceeded", "sourceEvaluation"]) assert.equal(proof[field], false);
  for (const field of ["liveFrameCount", "largestFreeBlockBytes", "cachedPlaneBytes", "independentValidation"]) assert.equal(proof[field], null);
  assert.equal(proof.nativeEncoderOwnership[0].frames, 243); assert.equal(proof.nativeEncoderOwnership[0].closed, true);
  assert.equal(proof.javascriptFramesInspected, 0); assert.ok(proof.propertyOperations <= 64);
  assert.equal(proof.incrementalPrivateMiBIncomplete, (proof.completeChromiumPeak.privateBytes - proof.blankBaseline.privateBytes) / 1048576);
  assert.equal(proof.completeChromiumPeak.processes.reduce((sum, process) => sum + process.privateBytes, 0), proof.completeChromiumPeak.privateBytes);
  assert.equal(proof.prerequisite.knownWasmArgument, 123456); assert.equal(proof.prerequisite.conversionsPerformed, 0);
  assert.equal(proof.prerequisite.originalFileUsed, false); assert.equal(proof.prerequisite.dedicatedWorkerTransportVerified, true);
});
test("Executed capture, tiny prerequisite and static metadata reader source identities remain unchanged", async () => {
  for (const [file, digest] of Object.entries({ ...proof.sourcePins, ...proof.prerequisite.sourcePins,
    "scripts/lib/wasm-function-metadata.mjs": proof.metadataReaderSha256 }))
    assert.equal(createHash("sha256").update(await readFile(new URL(file, root))).digest("hex"), digest, file);
  assert.equal(proof.original.bytes, 2958573265);
  assert.equal(proof.original.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.cleanup.errors, undefined);
  for (const value of Object.values(proof.cleanup).filter(value => typeof value === "boolean")) assert.equal(value, true);
});
