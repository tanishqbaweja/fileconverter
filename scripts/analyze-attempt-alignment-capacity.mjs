import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
import { deriveAttemptAlignmentCapacity } from "./lib/attempt-alignment-capacity.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const flowPath = "evidence/2026-10-11T17-14-33-847Z-attempt-alignment-static.json", flowBytes = await read(flowPath), flow = JSON.parse(flowBytes);
assert.equal(flow.failure, null); assert.equal(flow.inspection.instantiated, false); assert.equal(flow.cleanup.runtimeCacheAndToolRemoved, true);
const inputBytes = await read(flow.input.path); assert.equal(sha(inputBytes), flow.input.sha256); const terminal = JSON.parse(inputBytes); assert.equal(terminal.failure, null);
const binary = await read(flow.inspection.binary.path); assert.equal(sha(binary), flow.inspection.binary.sha256);
const record = flow.inspection.archive, zipped = await read(record.path); assert.equal(sha(zipped), record.sha256); assert.equal(zipped.length, record.bytes);
const bytes = gunzipSync(zipped, { maxOutputLength: 8388608 }); assert.equal(sha(bytes), record.restoredSha256); assert.equal(bytes.length, record.restoredBytes);
const archive = JSON.parse(bytes), metadata = readWasmFunctionMetadata(binary, new Set(["__wrap_posix_memalign", "emscripten_builtin_malloc"]));
for (const row of archive.functions) {
  assert.deepEqual(metadata.find(meta => meta.name === row.name), row.originalMetadata); assert.equal(sha(row.text), row.textSha256);
  assert.equal(sha(binary.subarray(row.originalMetadata.bodyStart, row.originalMetadata.bodyEnd)), row.originalBodySha256);
}
const wrapper = archive.functions.find(row => row.name === "__wrap_posix_memalign"), allocator = archive.functions.find(row => row.name === "emscripten_builtin_malloc");
const listing = archive.listing.listings.find(row => row.functionIndex === 4471);
assert.equal(listing.originalInstructionAddressesRecoveredFromByteExactBodies, true);
const callSites = [...listing.text.matchAll(/^\s*([0-9a-f]+):[^\n]*call 4436 <emscripten_builtin_malloc>/gm)];
assert.equal(callSites.length, 2); assert.equal(callSites[1][1], "606e5c");
const result = deriveAttemptAlignmentCapacity({ wrapperText: wrapper.text, allocatorText: allocator.text,
  fatalInstruction: flow.inspection.actualFatalCall.originalInstruction, failure: terminal.result.failedAllocation });
const sourceFiles = ["scripts/analyze-attempt-alignment-capacity.mjs", "scripts/lib/attempt-alignment-capacity.mjs", "tests/attempt-alignment-capacity.test.mjs"];
const sourcePins = {}, sourcePreimages = {}; for (const file of sourceFiles) { const b = await read(file); sourcePins[file] = sha(b); sourcePreimages[file] = { encoding: "base64", data: b.toString("base64") }; }
const proof = { recordedAt: new Date().toISOString(), status: "actual-current-alignment-fallback-capacity-proven-not-fixed", flow: { path: flowPath, sha256: sha(flowBytes) },
  actualBinary: flow.inspection.binary, actualCurrentBodiesAndOriginalSecondMallocPcJoined: true, result, sourcePins, sourcePreimages,
  historicalTerminalAndSlotNotRewritten: true, originalVideoRead: false, conversions: 0, publicAcceptance: false };
const output = "evidence/attempt-alignment-capacity-2026-10-11.json"; await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, ...result }));
