// Genuine browser fatal prerequisite, not video/performance/memory acceptance.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const receipt = JSON.parse(await read("evidence/2026-10-11T12-49-19-512Z-allocation-attempt-abort-control-executed-sources.json"));
const proofBytes = await read(receipt.proof.path), proof = JSON.parse(proofBytes);
test("actual fatal joins qualified binary/map/source preimages and byte-exact non-export sections", async () => {
  assert.equal(sha(proofBytes), receipt.proof.sha256); assert.equal(proof.status, "passed-synthetic-abort-control");
  assert.equal(receipt.browserDriverImported, true); assert.equal(receipt.launchHostPreflight.safeToStart, true);
  assert.equal(receipt.failure, null); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
  assert.equal(Object.keys(receipt.sourcePins).length, 74);
  const zipped = await read(receipt.archive.path); assert.equal(zipped.length, receipt.archive.bytes); assert.equal(sha(zipped), receipt.archive.sha256);
  const bytes = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(bytes.length, receipt.archive.restoredBytes); assert.equal(sha(bytes), receipt.archive.restoredSha256);
  const archive = JSON.parse(bytes); assert.deepEqual(archive.sourcePins, receipt.sourcePins); assert.deepEqual(archive.layout, receipt.layout);
  for (const [file, hash] of Object.entries(receipt.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(archive.preimages[file], "base64")), hash, file);
  }
  assert.equal(sha(archive.generated), archive.generatedSha256); assert.equal(sha(archive.worker), archive.workerSha256);
  assert.equal(archive.worker, proof.workerSource); assert.equal(archive.workerSha256, proof.workerSourceSha256);
  assert.equal(receipt.layout.allocator.address, 1786648); assert.equal(receipt.layout.slot.address, 1918736);
  assert.equal(receipt.layout.slot.bytes, 64); assert.equal(sha(await read(receipt.layout.map.path)), receipt.layout.map.sha256);
  assert.equal(sha(await read(receipt.layout.binary.path)), "9ce862602f8db5e61f5047e4ecdccea1d8f7e8c98452fb486a95befeeb558039");
  assert.equal(proof.exportOnlyControl.controlSha256, proof.result.actualBinarySha256);
  assert.equal(proof.exportOnlyControl.onlyExportSectionChanged, true); assert.equal(proof.exportOnlyControl.usableForMediaOrAcceptance, false);
  for (const section of proof.exportOnlyControl.sections) if (section.id !== 7) assert.equal(section.originalSha256, section.outputSha256);
});
test("real native C record proves the synthetic fast malloc request, preserves fatal semantics and bounds all reads", () => {
  const { loaded, terminal, symbolizedAbortFrames } = proof.result, row = terminal.emitted, attempt = row.allocationAttempt;
  assert.equal(loaded.capture.captureStarted, false); assert.equal(terminal.heapBytes, 33554432); assert.equal(loaded.heapBytes, terminal.heapBytes);
  assert.equal(terminal.originalCalls, 1); assert.equal(terminal.beforeLimit, terminal.afterLimit);
  assert.match(terminal.failure.message, /^Aborted\(/); assert.equal(terminal.capture.nativeErrorSuppressed, false);
  assert.equal(row.allocationAttemptUnavailable, null); assert.equal(row.qualifiedDirectBufferCallPath, true);
  assert.equal(attempt.phase, "fast-malloc-pending"); assert.equal(attempt.wrapperRequestedBytes, 33554432);
  assert.equal(attempt.failedIndividualAllocationBytes, terminal.syntheticRequestedAllocationBytes); assert.equal(row.failedIndividualAllocationBytes, 33554432);
  assert.equal(attempt.wordsRead, 16); assert.equal(attempt.slotBytes, 64); assert.equal(attempt.sequence, 1);
  assert.equal(attempt.alignment, 16); assert.equal(attempt.completed, false); assert.equal(attempt.allocatorInternalChunkBytes, null);
  assert.equal(row.heapLiveBytes, null); assert.equal(row.originalFailureCauseProven, false); assert.equal(row.fragmentationCauseProven, false);
  assert.equal(row.allocatorFreeBlocksUnavailable, null); assert.equal(row.allocatorFreeBlocks.complete, true);
  assert.equal(row.allocatorFreeBlocks.headerWordsRead, 44); assert.equal(row.allocatorFreeBlocks.totalFreeChunkBytes, 2944);
  for (const key of ["heapCopied", "payloadRead", "nativeFunctionsCalled", "allocatorMutated", "fragmentationCauseProven"]) assert.equal(row.allocatorFreeBlocks[key], false, key);
  assert.deepEqual(symbolizedAbortFrames.map(frame => [frame.functionIndex, frame.functionNameFromActualBinary]),
    [[4441, "sbrk"], [4436, "emscripten_builtin_malloc"], [4471, "__wrap_posix_memalign"], [4312, "av_malloc"], [4188, "av_buffer_allocz"]]);
});
test("successful fatal control releases owned browser/profile/scratch and does not publish a conversion or memory baseline", async () => {
  assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.protectedSourceRead, false); assert.equal(proof.nativeConverterUsed, false);
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.primaryIncrementalPrivateMiB, null); assert.equal(proof.publicAcceptance, false);
  assert.equal(proof.heapGrowthAllowed, false); assert.deepEqual(proof.forbiddenRequests, []); assert.deepEqual(proof.cleanup.errors, []);
  for (const key of ["workerTerminated", "normalBrowserCloseRequested", "serverClosed", "allSampledNativeBirthsAbsent", "runtimeProfileRemoved"]) assert.equal(proof.cleanup[key], true, key);
  assert.equal(proof.cleanup.checkedNativeIdentities, 11); assert.deepEqual(proof.cleanup.observedProcesses, []);
  assert.equal(proof.cleanup.rootExit.status, "owned-identity-absent"); assert.equal(proof.cleanup.rootExit.noProcessesKilled, true);
  assert.equal(receipt.syntheticExportOnlyBinaryRemovedWithCallerScratch, true);
  await assert.rejects(access(receipt.ownedCaller), { code: "ENOENT" }); await assert.rejects(access(proof.runtimeDirectory), { code: "ENOENT" });
});
