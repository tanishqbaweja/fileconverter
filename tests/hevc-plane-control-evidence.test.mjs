import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmFunctionMetadata } from "../scripts/lib/wasm-function-metadata.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const receipt = JSON.parse(await read("evidence/2026-10-11T23-31-32-593Z-hevc-plane-abort-control-executed-sources.json"));
const proofBytes = await read(receipt.proof.path), proof = JSON.parse(proofBytes);
test("actual new-binary fatal joins126 current/pre/post/preimages, fresh function bodies/PCs, map and export-only code equality", async () => {
  assert.equal(sha(proofBytes), receipt.proof.sha256); assert.equal(proof.status, "passed-synthetic-abort-control");
  assert.equal(receipt.failure, null); assert.equal(receipt.browserDriverImported, true); assert.equal(receipt.launchHostPreflight.safeToStart, true);
  assert.deepEqual(receipt.sourcePins, receipt.postSourcePins); assert.equal(Object.keys(receipt.sourcePins).length, 126);
  const compressed = await read(receipt.archive.path); assert.equal(sha(compressed), receipt.archive.sha256); assert.equal(compressed.length, receipt.archive.bytes);
  const bytes = gunzipSync(compressed, { maxOutputLength: 2097152 }); assert.equal(sha(bytes), receipt.archive.restoredSha256); assert.equal(bytes.length, receipt.archive.restoredBytes);
  const archive = JSON.parse(bytes); assert.deepEqual(archive.layout, receipt.layout); assert.deepEqual(archive.sourcePins, receipt.sourcePins);
  for (const [file, hash] of Object.entries(receipt.sourcePins)) { assert.equal(sha(await read(file)), hash); assert.equal(sha(Buffer.from(archive.preimages[file], "base64")), hash); }
  assert.equal(sha(archive.generated), archive.generatedSha256); assert.equal(archive.worker, proof.workerSource); assert.equal(sha(archive.worker), proof.workerSourceSha256);
  const binary = await read(receipt.layout.binary.path); assert.equal(sha(binary), "07ff8c19e9f58205f21a9cd10f6d7f0e0fb8f1e7086b810818724846117d51e4");
  const metadata = readWasmFunctionMetadata(binary, new Set(receipt.layout.functions.map(row => row.name)));
  for (const { bodySha256, ...row } of receipt.layout.functions) { assert.deepEqual(metadata.find(value => value.name === row.name), row); assert.equal(sha(binary.subarray(row.bodyStart, row.bodyEnd)), bodySha256); }
  assert.equal(sha(await read(receipt.layout.map.path)), receipt.layout.map.sha256);
  assert.equal(proof.exportOnlyControl.originalSha256, receipt.layout.binary.sha256);
  assert.equal(proof.exportOnlyControl.controlSha256, proof.result.actualBinarySha256);
  assert.equal(proof.exportOnlyControl.onlyExportSectionChanged, true); assert.equal(proof.exportOnlyControl.usableForMediaOrAcceptance, false);
  for (const section of proof.exportOnlyControl.sections) if (section.id !== 7) assert.equal(section.originalSha256, section.outputSha256);
  assert.deepEqual(proof.result.symbolizedAbortFrames.map(row => [row.functionIndex, row.functionNameFromActualBinary, row.codeOffset]),
    [[4442, "sbrk", "0x5fb47d"], [4437, "emscripten_builtin_malloc", "0x5f913a"], [4472, "__wrap_posix_memalign", "0x6071aa"], [4313, "av_malloc", "0x5df83d"], [4188, "av_buffer_allocz", "0x5c64e4"]]);
});
test("actual bounded C slot/header capture preserves fatal chain, never reads unrelated pool/payload or pretends synthetic failure is media acceptance", () => {
  const { loaded, terminal } = proof.result, row = terminal.emitted;
  assert.equal(terminal.originalCalls, 1); assert.equal(terminal.beforeLimit, terminal.afterLimit); assert.match(terminal.failure.message, /^Aborted\(/);
  assert.equal(terminal.capture.nativeErrorSuppressed, false); assert.equal(loaded.heapBytes, 33554432); assert.equal(terminal.heapBytes, loaded.heapBytes);
  assert.equal(row.qualifiedBinarySha256, receipt.layout.binary.sha256); assert.equal(row.allocationAttemptUnavailable, null);
  assert.equal(row.allocationAttempt.phase, "fast-malloc-pending"); assert.equal(row.wrapperRequestedBytes, 33554432);
  assert.equal(row.failedIndividualAllocationBytes, 33554432); assert.equal(row.allocationAttempt.wordsRead, 16); assert.equal(row.validatedScalarWords, 16);
  assert.equal(row.qualifiedDirectBufferCallPath, true); assert.equal(row.qualifiedPoolCallPath, false); assert.equal(row.latePoolRequest, null);
  assert.equal(row.heapLiveBytes, null); assert.equal(row.originalFailureCauseProven, false); assert.equal(row.fragmentationCauseProven, false);
  const free = row.allocatorFreeBlocks; assert.equal(row.allocatorFreeBlocksUnavailable, null); assert.equal(free.complete, true); assert.equal(free.headerWordsRead, 44);
  assert.equal(free.totalFreeChunkBytes, 2896); assert.equal(free.maximumHeaderWords, 32768); assert.equal(free.maximumChunks, 4096);
  for (const key of ["heapCopied", "payloadRead", "nativeFunctionsCalled", "allocatorMutated", "fragmentationCauseProven"]) assert.equal(free[key], false);
  assert.equal(proof.primaryIncrementalPrivateMiB, null); assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.protectedSourceRead, false);
});
test("actual synthetic control closes owned worker/browser/server and all11 sampled birth identities, leaves no profile/control binary", async () => {
  assert.deepEqual(proof.forbiddenRequests, []); assert.deepEqual(proof.cleanup.errors, []);
  for (const key of ["workerTerminated", "normalBrowserCloseRequested", "serverClosed", "allSampledNativeBirthsAbsent", "runtimeProfileRemoved"]) assert.equal(proof.cleanup[key], true);
  assert.equal(proof.cleanup.checkedNativeIdentities, 11); assert.deepEqual(proof.cleanup.observedProcesses, []); assert.equal(proof.cleanup.rootExit.status, "owned-identity-absent");
  assert.equal(proof.cleanup.rootExit.noProcessesKilled, true); assert.equal(receipt.syntheticExportOnlyBinaryRemovedWithCallerScratch, true);
  await assert.rejects(access(receipt.ownedCaller), { code: "ENOENT" }); await assert.rejects(access(proof.runtimeDirectory), { code: "ENOENT" });
  assert.equal(proof.nativeConverterUsed, false); assert.equal(proof.publicAcceptance, false);
});
