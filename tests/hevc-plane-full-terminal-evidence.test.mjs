// Post-audit witness: the two executed auditor sources remain byte-frozen.
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/layered-full-source-archive.mjs";
import { readWasmFunctionMetadata } from "../scripts/lib/wasm-function-metadata.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const bytes = await read("evidence/2026-10-11T23-47-49-089Z-hevc-plane-original-full-terminal-analysis.json"), proof = JSON.parse(bytes);
test("actual failed original joins338 executed sources, both auditor preimages and nine actual typed fatal bodies", async () => {
  assert.equal(sha(bytes), "0587b19e2b5675e277fdd00e54bae9f1440af0dce6a6825aa008a68e39c87705");
  assert.equal(proof.failure, null); assert.equal(proof.all338CurrentPrePostPreimageJoins, true);
  const terminalBytes = await read(proof.terminal.path); assert.equal(sha(terminalBytes), proof.terminal.sha256);
  const terminal = JSON.parse(terminalBytes), sources = await materializeLayeredFullSourceArchive(root, proof.sourceArchive);
  assert.deepEqual(sources.sourcePins, terminal.sourcePins); assert.deepEqual(terminal.postSourcePins, terminal.sourcePins);
  assert.equal(Object.keys(sources.sourcePreimages).length, 338);
  assert.equal(Object.keys(proof.sourcePins).length, 2); assert.deepEqual(proof.sourcePins, proof.postSourcePins);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await read(file)), hash); assert.equal(sha(Buffer.from(proof.sourcePreimages[file].data, "base64")), hash);
  }
  const binary = await read(proof.actualBinary.path); assert.equal(binary.length, proof.actualBinary.bytes); assert.equal(sha(binary), proof.actualBinary.sha256);
  assert.equal(proof.compiledFailureFunctions.length, 9);
  const metadata = readWasmFunctionMetadata(binary, new Set(proof.compiledFailureFunctions.map(row => row.name)));
  for (const row of proof.compiledFailureFunctions) {
    const actual = metadata.find(item => item.name === row.name);
    assert.deepEqual(actual, Object.fromEntries(Object.keys(actual).map(key => [key, row[key]])));
    assert.equal(sha(binary.subarray(actual.bodyStart, actual.bodyEnd)), row.bodySha256);
    assert.ok(Number(row.observedCodeOffset) >= actual.bodyStart && Number(row.observedCodeOffset) < actual.bodyEnd);
    assert.equal(row.observedPcInsideActualTypedBody, true);
  }
});
test("all92669 native samples survive; one packet failed, no invented individual allocation or acceptance", async () => {
  const zipped = await read(proof.rawArchive.path); assert.equal(zipped.length, proof.rawArchive.bytes); assert.equal(sha(zipped), proof.rawArchive.sha256);
  const restored = gunzipSync(zipped, { maxOutputLength: 33554432 });
  assert.equal(restored.length, proof.rawArchive.restoredBytes); assert.equal(sha(restored), proof.rawArchive.restoredSha256);
  const raw = JSON.parse(restored), result = proof.result;
  assert.equal(result.native.observedIncrementalPrivateMiB, (475750400 - 240480256) / 1024 ** 2);
  assert.equal(result.native.observedIncrementalPrivateMiB, 224.37109375); assert.equal(result.rowsCountedWithoutDropping, 92669);
  const active = raw.nativeMemory.phases.find(row => row.phase === "conversion-1");
  assert.equal(active.validSamples, 89650); assert.equal(active.unavailableSamples, 0);
  for (const field of ["samplesDropped", "timestampsRewritten"]) assert.equal(raw.nativeMemory.receiptClockFence[field], 0);
  assert.equal(raw.nativeMemory.receiptClockFence.monitorClosed, true);
  assert.equal(result.frames, 244873); assert.equal(result.completedPackets, 244872); assert.equal(result.uncompletedBridgedPackets, 1);
  assert.equal(result.elapsedMs, 9782117.139999986); assert.equal(result.generatedPartialOutputBytes, 4778321222);
  assert.equal(result.observedFailureCallPath, "packet-reallocation"); assert.equal(result.individualAllocationObserved, false);
  assert.equal(result.failedAllocation.attemptedHeapExtentBytes, 33599488); assert.equal(result.failedAllocation.requestedHeapExtentIsIndividualAllocation, false);
  for (const field of ["wrapperRequestedBytes", "failedIndividualAllocationBytes", "allocatorFreeBlocks", "heapLiveBytes", "phase", "sequence"]) assert.equal(result.failedAllocation[field], null);
  assert.equal(result.completedConversions, 0); assert.equal(result.numericSsim, null); assert.equal(result.acceptedOutputBytes, 0);
  for (const field of ["fullOriginalAcceptance", "completeChromiumMemoryAcceptance", "conversionSpeedAcceptance", "publicAcceptance", "sameFailedConfigurationShouldBeRepeated"]) assert.equal(result[field], false);
});
test("25 launch/birth identities independently absent, scratch removed and complete original unchanged", async () => {
  assert.equal(proof.independentlyObservedOwnedAbsence.length, 25);
  for (const row of proof.independentlyObservedOwnedAbsence) {
    assert.equal(row.status, "owned-identity-absent"); assert.equal(row.noProcessesKilled, true); assert.equal(row.unavailableIsNotZero, true);
  }
  assert.deepEqual(proof.protectedBefore, proof.protectedAfter); assert.equal(proof.protectedAfter.bytes, 2958573265);
  assert.equal(proof.protectedAfter.sha256, "31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  assert.equal(proof.ownedScratchAbsent, true); assert.equal(proof.stockUiRestored, true); assert.equal(proof.redundantRawDeletedAfterByteExactArchive, true);
  const terminal = JSON.parse(await read(proof.terminal.path));
  for (const directory of [terminal.wrapper, terminal.candidateDirectory]) await assert.rejects(access(directory), { code: "ENOENT" });
});
