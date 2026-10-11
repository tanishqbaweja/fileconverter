import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmFunctionMetadata } from "../scripts/lib/wasm-function-metadata.mjs";
import { deriveAttemptAlignmentCapacity } from "../scripts/lib/attempt-alignment-capacity.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file)), json = async file => JSON.parse(await read(file));
test("first cap failure and later successful static audit bind their historical executed sources; lint-only correction is explicit", async () => {
  const sourcePath = "scripts/audit-attempt-alignment-callsite.mjs";
  for (const [proofPath, receiptKey, failed] of [
    ["evidence/attempt-alignment-static-first-failure-sources-2026-10-11.json", "failureReceipt", true],
    ["evidence/attempt-alignment-static-executed-sources-2026-10-11.json", "actualReceipt", false],
  ]) {
    const proof = await json(proofPath), receipt = await json(proof[receiptKey]);
    const preimage = proof.sourcePreimages[sourcePath];
    const bytes = Buffer.from(typeof preimage === "string" ? preimage : preimage.data, "base64");
    assert.equal(sha(bytes), proof.sourcePins[sourcePath]); assert.equal(receipt.sourceSha256, sha(bytes));
    assert.equal(receipt.originalVideoRead, false); assert.equal(receipt.conversions, 0);
    assert.equal(receipt.cleanup.runtimeCacheAndToolRemoved, true);
    await assert.rejects(access(receipt.cleanup.runtimeDirectory), { code: "ENOENT" });
    if (failed) { assert.match(receipt.failure, /disassembly.*(?:limit|cap|exceed)|(?:limit|cap|exceed).*disassembly/i); assert.equal(receipt.inspection, null); }
    else {
      assert.equal(receipt.failure, null);
      const current = (await read(sourcePath)).toString();
      let restored = current.replaceAll("disassemblyModule", "module");
      restored = restored.replace("selectedFunctions: functions.map(row => ({ name: row.name, originalMetadata: row.originalMetadata, originalBodySha256: row.originalBodySha256, textSha256: row.textSha256 }))", "selectedFunctions: functions.map(({ text: _text, ...rest }) => rest)");
      assert.equal(sha(restored), sha(bytes), "Only explicit lint correction differs from successful executed source");
    }
  }
});
test("capacity evidence independently rejoins actual binary bodies/PC/archive and scalar failure with unchanged current proof sources", async () => {
  const proof = await json("evidence/attempt-alignment-capacity-2026-10-11.json"), flowBytes = await read(proof.flow.path), flow = JSON.parse(flowBytes);
  assert.equal(sha(flowBytes), proof.flow.sha256);
  for (const [file, hash] of Object.entries(proof.sourcePins)) {
    assert.equal(sha(await read(file)), hash); assert.equal(sha(Buffer.from(proof.sourcePreimages[file].data, "base64")), hash);
  }
  const record = flow.inspection.archive, compressed = await read(record.path);
  assert.equal(compressed.length, record.bytes); assert.equal(sha(compressed), record.sha256);
  const restored = gunzipSync(compressed, { maxOutputLength: 8388608 }); assert.equal(restored.length, record.restoredBytes); assert.equal(sha(restored), record.restoredSha256);
  const archive = JSON.parse(restored), binary = await read(flow.inspection.binary.path);
  assert.equal(sha(binary), proof.actualBinary.sha256);
  const metadata = readWasmFunctionMetadata(binary, new Set(archive.functions.map(row => row.name)));
  for (const row of archive.functions) {
    assert.deepEqual(metadata.find(meta => meta.name === row.name), row.originalMetadata);
    assert.equal(sha(binary.subarray(row.originalMetadata.bodyStart, row.originalMetadata.bodyEnd)), row.originalBodySha256);
    assert.equal(sha(row.text), row.textSha256);
  }
  const input = await read(flow.input.path); assert.equal(sha(input), flow.input.sha256);
  const failure = JSON.parse(input).result.failedAllocation;
  const calls = [...archive.listing.listings.find(row => row.functionIndex === 4471).text.matchAll(/^\s*([0-9a-f]+):[^\n]*call 4436 <emscripten_builtin_malloc>/gm)];
  assert.equal(calls.length, 2); assert.equal(calls[1][1], "606e5c");
  assert.deepEqual(deriveAttemptAlignmentCapacity({ wrapperText: archive.functions.find(row => row.name === "__wrap_posix_memalign").text,
    allocatorText: archive.functions.find(row => row.name === "emscripten_builtin_malloc").text,
    fatalInstruction: flow.inspection.actualFatalCall.originalInstruction, failure }), proof.result);
  assert.equal(proof.result.capturedChunkShortfallBytes, 8); assert.equal(proof.result.whyHeapFragmentedProven, false);
  assert.equal(proof.result.newAlignmentPolicyWorksProven, false); assert.equal(failure.failedIndividualAllocationBytes, null);
});
