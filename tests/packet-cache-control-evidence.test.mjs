import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmFunctionMetadata } from "../scripts/lib/wasm-function-metadata.mjs";
import { verifyPacketCacheNativeEnvelope } from "../scripts/lib/packet-cache-native-envelope.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const stamp = "2026-10-12T05-30-34-367Z";
async function evidence() {
  const witness = JSON.parse(await read(`evidence/${stamp}-packet-cache-abort-control-executed-sources.json`));
  const proofBytes = await read(witness.proof.path); assert.equal(sha(proofBytes), witness.proof.sha256);
  assert.equal(witness.proof.sha256, "fe96560b38dcf699fdaf5ac8565b818facb4891a7dee8c7b22f56e9696982613");
  return { witness, proof: JSON.parse(proofBytes) };
}
test("actual 4421 browser fatal joins all typed bodies/PCs, exact bounded scalar/header capture and normal cleanup", async () => {
  const { witness, proof } = await evidence();
  assert.equal(proof.status, "passed-synthetic-abort-control"); assert.equal(proof.failure, null);
  assert.equal(witness.failure, null); assert.equal(witness.browserDriverImported, true);
  const binary = await read(witness.layout.binary.path); assert.equal(sha(binary), witness.layout.binary.sha256);
  const functions = readWasmFunctionMetadata(binary, new Set(witness.layout.functions.map(row => row.name)));
  assert.equal(functions.length, 9);
  for (const row of functions) {
    const expected = witness.layout.functions.find(item => item.name === row.name);
    assert.deepEqual({ ...row, bodySha256: sha(binary.subarray(row.bodyStart, row.bodyEnd)) }, expected);
  }
  for (const frame of proof.result.symbolizedAbortFrames) {
    const typed = functions.find(row => row.functionIndex === frame.functionIndex); assert.ok(typed);
    const pc = Number(frame.codeOffset); assert.ok(pc >= typed.bodyStart && pc < typed.bodyEnd);
    assert.equal(typed.name, frame.functionNameFromActualBinary);
  }
  const value = proof.result.terminal.emitted;
  assert.equal(value.qualifiedDirectBufferCallPath, true); assert.equal(value.qualifiedPoolCallPath, false);
  assert.equal(value.validatedScalarWords, 16); assert.equal(value.allocatorFreeBlocks.headerWordsRead, 44);
  assert.equal(value.failedIndividualAllocationBytes, 33554432); assert.equal(value.latePoolRequest, null);
  assert.equal(value.heapLiveBytes, null); assert.equal(value.noPayloadRead, true); assert.equal(value.noHeapCopy, true);
  assert.equal(value.noNativeCallsAtAbort, true); assert.equal(value.originalFailureCauseProven, false);
  assert.deepEqual(proof.forbiddenRequests, []); assert.deepEqual(proof.cleanup.errors, []);
  assert.equal(proof.cleanup.allSampledNativeBirthsAbsent, true); assert.equal(proof.cleanup.checkedNativeIdentities, 11);
  assert.equal(proof.cleanup.rootExit.noProcessesKilled, true);
  for (const directory of [proof.runtimeDirectory, witness.ownedCaller]) await assert.rejects(access(directory), { code: "ENOENT" });
  assert.equal(witness.syntheticExportOnlyBinaryRemovedWithCallerScratch, true);
  assert.equal(proof.browserConversionsPerformed, 0); assert.equal(proof.protectedSourceRead, false);
  assert.equal(proof.primaryMemoryAcceptance, false); assert.equal(proof.publicAcceptance, false);
});
test("all 74 executed browser source preimages and separate 72 native sources are recoverable/current/pre/post bound with unchanged caps", async () => {
  const { witness, proof } = await evidence();
  assert.equal(Object.keys(witness.sourcePins).length, 74); assert.ok(Object.keys(witness.sourcePins).length <= 128);
  assert.deepEqual(witness.sourcePins, witness.postSourcePins);
  const compressed = await read(witness.archive.path); assert.equal(sha(compressed), witness.archive.sha256);
  assert.equal(compressed.length, witness.archive.bytes);
  const bytes = gunzipSync(compressed, { maxOutputLength: 2097152 });
  assert.equal(bytes.length, witness.archive.restoredBytes); assert.equal(sha(bytes), witness.archive.restoredSha256);
  const archive = JSON.parse(bytes); assert.deepEqual(archive.sourcePins, witness.sourcePins);
  assert.equal(sha(archive.generated), archive.generatedSha256); assert.equal(sha(proof.workerSource), archive.workerSha256);
  for (const [file, expected] of Object.entries(witness.sourcePins)) {
    const preimage = Buffer.from(archive.preimages[file], "base64"); assert.ok(preimage.length <= 2097152);
    assert.equal(sha(preimage), expected, file); assert.equal(sha(await read(file)), expected, file);
  }
  for (const [file, expected] of Object.entries(proof.sourcePins)) assert.equal(witness.sourcePins[file], expected, file);
  const buildBytes = await read(witness.layout.build.path), build = JSON.parse(buildBytes), branch = JSON.parse(await read(witness.layout.branch.path));
  const native = await verifyPacketCacheNativeEnvelope(root, build, buildBytes, branch);
  assert.deepEqual(native, witness.layout.nativeSourceEnvelope); assert.deepEqual(native, witness.nativeSourceEnvelopePost);
  const factory = await import(`data:text/javascript;base64,${Buffer.from(archive.factorySource).toString("base64")}`);
  const original = await read(witness.layout.binary.path), control = factory.createAllocationAttemptExportOnlyControl(original);
  assert.equal(control.onlyExportSectionChanged, true); assert.equal(control.allCodeDataTypesImportsTablesMemoryExact, true);
  assert.equal(control.originalSha256, witness.layout.binary.sha256); assert.equal(control.usableForMediaOrAcceptance, false);
  assert.equal(control.controlSha256, proof.exportOnlyControl.controlSha256);
});
