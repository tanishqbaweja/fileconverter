import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyPrivateRequest } from "../scripts/lib/private-browser-request.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const proofs = await Promise.all(["", "-retry", "-origin-checked"].map(async suffix =>
  JSON.parse(await readFile(new URL(`../evidence/wasm-abort-capture-control${suffix}-2026-10-08.json`, import.meta.url)))));

test("both failed abort controls remain failures with their exact executed source and worker pins", async () => {
  const [initial, retry, final] = proofs;
  assert.equal(initial.status, "failed-synthetic-abort-control");
  assert.equal(initial.result.terminal.failure.message, "core._malloc is not a function");
  assert.equal(initial.result.terminal.capture.first, null);
  assert.equal(initial.result.terminal.originalCalls, 0);
  assert.equal(retry.status, "failed-synthetic-abort-control");
  assert.ok(retry.forbiddenRequests.length > 0); assert.match(retry.failure.message, /chrome-extension/);
  assert.equal(final.status, "passed-synthetic-abort-control"); assert.equal(final.failure, null);
  for (const proof of proofs) {
    assert.equal(sha(proof.workerSource), proof.workerSourceSha256);
    for (const [file, digest] of Object.entries(proof.sourcePins))
      assert.equal(sha(await readFile(new URL(`../${file}`, import.meta.url))), digest, file);
  }
});

test("actual unchanged decoder synthetic OOM captures one allocator stack without suppressing the fatal error", () => {
  const proof = proofs[2], { loaded, terminal } = proof.result;
  assert.equal(loaded.capture.first, null); assert.equal(loaded.capture.captureStarted, false);
  assert.equal(loaded.shared, true); assert.equal(loaded.originIsolated, true);
  assert.equal(loaded.heapBytes, 33554432); assert.equal(terminal.heapBytes, loaded.heapBytes);
  assert.equal(terminal.syntheticFunctionCall, "actual-instance.exports.malloc");
  assert.equal(terminal.syntheticRequestedAllocationBytes, 33554432);
  assert.equal(terminal.originalCalls, 1); assert.equal(terminal.beforeLimit, terminal.afterLimit);
  assert.match(terminal.failure.message, /Aborted\(Cannot enlarge memory arrays/);
  const capture = terminal.capture, row = capture.first;
  assert.equal(capture.maximumRecords, 1); assert.equal(capture.queuedRecords, 0);
  assert.equal(capture.nativeErrorSuppressed, false); assert.equal(capture.emitFailure, null);
  assert.equal(row.stackLimitRestored, true); assert.equal(row.unavailable, null);
  assert.equal(row.stackTruncated, false); assert.ok(row.stack.length <= 8192);
  assert.ok(row.reason.length <= 512); assert.deepEqual(row, terminal.emitted);
  assert.equal(proof.result.actualBinaryNames, 4655);
  assert.equal(proof.result.actualBinarySha256, "f4c5c17e6d0e53d0612ac6ae66dcf5f7057b9d7b923df99713a2b36d5545924a");
  assert.deepEqual(proof.result.symbolizedAbortFrames, [
    { functionIndex: 4439, functionNameFromActualBinary: "sbrk", codeOffset: "0x5faeab" },
    { functionIndex: 4434, functionNameFromActualBinary: "emscripten_builtin_malloc", codeOffset: "0x5f8b69" },
  ]);
  assert.equal(row.failedIndividualAllocationBytes, null); assert.equal(row.heapLiveBytes, null);
  assert.equal(proof.actualOriginalOomAllocationCallsite, null);
});

test("the original source-aware privacy guard allows only the proven local initiator, never converter initiation", () => {
  const proof = proofs[2], origin = new URL(proof.workerSource.match(/fetch\("([^\"]+)"\)/)[1],
    proof.result.terminal.capture.first.stack.match(/http:\/\/127\.0\.0\.1:\d+/)[0]).origin;
  assert.deepEqual(proof.forbiddenRequests, []); assert.equal(proof.browserLocalRequests.length, 1);
  const detail = proof.browserLocalRequests[0];
  assert.equal(classifyPrivateRequest(detail, origin), "browser-local");
  assert.equal(classifyPrivateRequest({ ...detail, frameUrl: origin, serviceWorkerUrl: null }, origin), "forbidden");
  assert.equal(classifyPrivateRequest({ ...detail, url: `${detail.url}?filename=secret.mkv` }, origin), "forbidden");
  assert.equal(classifyPrivateRequest({ ...detail, method: "POST", postData: "secret" }, origin), "forbidden");
});

test("all three controls cleaned owned native births/profile and never count as conversion or memory acceptance", () => {
  for (const proof of proofs) {
    assert.equal(proof.hostPreflight.safeToStart, true);
    assert.equal(proof.hostPreflight.requiredPhysicalBytes, 2147483648);
    assert.equal(proof.hostPreflight.requiredVirtualBytes, 2147483648);
    assert.equal(proof.flags.length, 14);
    assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.protectedSourceRead, false);
    assert.equal(proof.nativeConverterUsed, false); assert.equal(proof.heapGrowthAllowed, false);
    assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.primaryIncrementalPrivateMiB, null);
    assert.equal(proof.publicAcceptance, false); assert.equal(proof.debuggerPauseOrHeapDumpUsed, false);
    assert.equal(proof.cleanup.workerTerminated, true); assert.equal(proof.cleanup.serverClosed, true);
    assert.equal(proof.cleanup.runtimeProfileRemoved, true); assert.deepEqual(proof.cleanup.errors, []);
    assert.equal(proof.cleanup.rootExit.status, "owned-identity-absent");
    assert.equal(proof.cleanup.allSampledNativeBirthsAbsent, true);
    assert.equal(proof.cleanup.checkedNativeIdentities, proof.nativeIdentities.length);
    for (const sample of proof.snapshots) {
      assert.equal(sample.privateBytes, sample.processes.reduce((sum, process) => sum + process.privateBytes, 0));
      assert.ok(sample.processes.every(process => process.privateBytes > 0));
    }
  }
});
