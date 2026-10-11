// Actual combined observer witness. Synthetic fatal is NEVER media acceptance.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const receipt = JSON.parse(await read("evidence/2026-10-11T13-10-58-221Z-composite-allocation-abort-control-executed-sources.json"));
const proofBytes = await read(receipt.proof.path), proof = JSON.parse(proofBytes);
test("actual composite fatal joins all102 current/pre/post/source preimages and generated worker/factories within unchanged caps", async () => {
  assert.equal(sha(proofBytes), "2152a2113618e86e70aae2002b8902ae7fab85da88ae4505d9b6d14ac8d0eaf3");
  assert.equal(sha(proofBytes), receipt.proof.sha256); assert.equal(proof.status, "passed-synthetic-abort-control");
  assert.equal(receipt.failure, null); assert.equal(receipt.browserDriverImported, true);
  assert.equal(Object.keys(receipt.sourcePins).length, 102); assert.deepEqual(receipt.sourcePins, receipt.postSourcePins);
  const zipped = await read(receipt.archive.path); assert.equal(zipped.length, 391985); assert.equal(zipped.length, receipt.archive.bytes);
  assert.equal(sha(zipped), receipt.archive.sha256); assert.equal(sha(zipped), "1cc022e8e0b777568945da01e08d2fb2f695395c5e6e14f1c72e08702eb58f28");
  const bytes = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(bytes.length, receipt.archive.restoredBytes);
  assert.equal(sha(bytes), receipt.archive.restoredSha256); const archive = JSON.parse(bytes);
  assert.deepEqual(archive.sourcePins, receipt.sourcePins); assert.deepEqual(archive.layout, receipt.layout);
  for (const [file, hash] of Object.entries(receipt.sourcePins)) {
    assert.equal(sha(await read(file)), hash, file); assert.equal(sha(Buffer.from(archive.preimages[file], "base64")), hash, file);
  }
  assert.equal(sha(archive.generated), archive.generatedSha256); assert.equal(archive.worker, proof.workerSource);
  assert.equal(sha(archive.worker), archive.workerSha256); assert.match(archive.worker, /createCompositeAllocationAbortCapture/);
  assert.equal(sha(await read(receipt.layout.binary.path)), "9ce862602f8db5e61f5047e4ecdccea1d8f7e8c98452fb486a95befeeb558039");
  assert.equal(sha(await read(receipt.layout.map.path)), receipt.layout.map.sha256);
  assert.equal(receipt.layout.poolSlot.address, 1918800); assert.equal(receipt.layout.poolSlot.bytes, 64);
  const getter = receipt.layout.functions.find(row => row.name === "av_refstruct_pool_get");
  assert.equal(getter.functionIndex, 4380); assert.deepEqual(getter.params, ["i32"]); assert.deepEqual(getter.results, ["i32"]);
  assert.equal(proof.exportOnlyControl.onlyExportSectionChanged, true); assert.equal(proof.exportOnlyControl.usableForMediaOrAcceptance, false);
  for (const section of proof.exportOnlyControl.sections) if (section.id !== 7) assert.equal(section.originalSha256, section.outputSha256);
});
test("real combined native fatal has one genuine pending fast request, no pool read or guessed internal size", () => {
  const { terminal, loaded } = proof.result, row = terminal.emitted;
  assert.equal(terminal.originalCalls, 1); assert.equal(terminal.beforeLimit, terminal.afterLimit);
  assert.equal(terminal.capture.nativeErrorSuppressed, false); assert.equal(loaded.capture.captureStarted, false);
  assert.equal(row.qualifiedDirectBufferCallPath, true); assert.equal(row.qualifiedPoolCallPath, false);
  assert.equal(row.failedIndividualAllocationBytes, terminal.syntheticRequestedAllocationBytes);
  assert.equal(row.failedIndividualAllocationBytes, 33554432); assert.equal(row.wrapperRequestedBytes, 33554432);
  assert.equal(row.allocationAttemptUnavailable, null); assert.equal(row.allocationAttempt.phase, "fast-malloc-pending");
  assert.equal(row.allocationAttempt.wordsRead, 16); assert.equal(row.validatedScalarWords, 16);
  assert.equal(row.allocationAttempt.completed, false); assert.equal(row.allocationAttempt.allocatorInternalChunkBytes, null);
  assert.equal(row.latePoolRequest, null); assert.match(row.latePoolRequestUnavailable, /not read/);
  assert.equal(row.allocatorFreeBlocksUnavailable, null); assert.equal(row.allocatorFreeBlocks.headerWordsRead, 44);
  assert.equal(row.allocatorFreeBlocks.totalFreeChunkBytes, 2944); assert.equal(row.maximumScalarWords, 32);
  assert.equal(row.heapLiveBytes, null); assert.equal(row.originalFailureCauseProven, false); assert.equal(row.fragmentationCauseProven, false);
  assert.match(terminal.failure.message, /^Aborted\(/); assert.equal(terminal.heapBytes, 33554432);
});
test("owned cleanup and unchanged host gate passed without media/source/primary-memory/public acceptance", async () => {
  assert.equal(receipt.launchHostPreflight.safeToStart, true); assert.equal(receipt.launchHostPreflight.requiredPhysicalBytes, 2147483648);
  assert.equal(receipt.launchHostPreflight.requiredVirtualBytes, 2147483648);
  assert.equal(receipt.launchHostPreflight.freePhysicalBytes, 4380086272); assert.equal(receipt.launchHostPreflight.freeVirtualBytes, 5636648960);
  for (const flag of ["workerTerminated", "normalBrowserCloseRequested", "serverClosed", "allSampledNativeBirthsAbsent", "runtimeProfileRemoved"])
    assert.equal(proof.cleanup[flag], true, flag);
  assert.equal(proof.cleanup.checkedNativeIdentities, 11); assert.deepEqual(proof.cleanup.errors, []); assert.deepEqual(proof.cleanup.observedProcesses, []);
  assert.equal(proof.cleanup.rootExit.status, "owned-identity-absent"); assert.equal(proof.cleanup.rootExit.noProcessesKilled, true);
  assert.deepEqual(proof.forbiddenRequests, []); assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.protectedSourceRead, false);
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.primaryIncrementalPrivateMiB, null); assert.equal(proof.publicAcceptance, false);
  assert.equal(receipt.syntheticExportOnlyBinaryRemovedWithCallerScratch, true);
  for (const target of [receipt.ownedCaller, proof.runtimeDirectory,
    "work/composite-control-wrapper-K1wlcf", "work/composite-control-wrapper-rAY1El"])
    await assert.rejects(access(path.isAbsolute(target) ? target : path.join(root, target)), { code: "ENOENT" });
});
