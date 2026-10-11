import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
import { reconstructExecutedHevcGetBuffer, deriveAlignment16FirstMallocCapacity } from "./lib/alignment16-first-malloc-capacity.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
const ownFiles = ["scripts/analyze-alignment16-first-malloc-capacity.mjs", "scripts/lib/alignment16-first-malloc-capacity.mjs", "tests/alignment16-first-malloc-capacity.test.mjs"];
const sourcePins = {}, sourcePreimages = {};
for (const file of ownFiles) { const bytes = await read(file); sourcePins[file] = sha(bytes); sourcePreimages[file] = { encoding: "base64", data: bytes.toString("base64") }; }
const flowPath = "evidence/2026-10-11T22-32-09-935Z-alignment16-malloc-static.json", flowBytes = await read(flowPath), flow = JSON.parse(flowBytes);
assert.equal(sha(flowBytes), "1ecb74c3009ba92115d70cf19b9066f2f9e25cd0dc1692f9949c4dea1c1ef498");
assert.equal(flow.failure, null); assert.equal(flow.inspection.instantiated, false); assert.equal(flow.cleanup.runtimeCacheAndToolRemoved, true);
const terminalBytes = await read(flow.input.path); assert.equal(sha(terminalBytes), flow.input.sha256);
assert.equal(sha(terminalBytes), "b84b2b9cbb63fd201c7faf07d71c53f681387a1ac7f049ff6a37d6110a4cf775");
const terminal = JSON.parse(terminalBytes), binary = await read(flow.inspection.binary.path); assert.equal(sha(binary), flow.inspection.binary.sha256);
const record = flow.inspection.archive, zipped = await read(record.path); assert.equal(zipped.length, record.bytes); assert.equal(sha(zipped), record.sha256);
const bytes = gunzipSync(zipped, { maxOutputLength: 8388608 }); assert.equal(bytes.length, record.restoredBytes); assert.equal(sha(bytes), record.restoredSha256);
const archive = JSON.parse(bytes), metadata = readWasmFunctionMetadata(binary, new Set(archive.functions.map(row => row.name)));
for (const row of archive.functions) {
  assert.deepEqual(metadata.find(value => value.name === row.name), row.originalMetadata);
  assert.equal(sha(binary.subarray(row.originalMetadata.bodyStart, row.originalMetadata.bodyEnd)), row.originalBodySha256); assert.equal(sha(row.text), row.textSha256);
}
const calls = [...archive.listing.listings.find(row => row.functionIndex === 4471).text.matchAll(/^\s*([0-9a-f]+):[^\n]*call 4436 <emscripten_builtin_malloc>/gm)];
assert.equal(calls.length, 2); assert.equal(calls[0][1], "606d5f"); assert.equal(calls[1][1], "606df9");
const frameLines = archive.listing.listings.find(row => row.functionIndex === 709).text.split("\n");
const at = frameLines.findIndex(line => /^\s*11b20b:/.test(line)); assert.ok(at >= 28);
const frameInstructionContext = frameLines.slice(at - 28, at + 6).join("\n");
const sourcePath = "work/mpeg2-encoder-planes-38044000567/encoder-plane-get-buffer.c", encoderSource = (await read(sourcePath)).toString();
const reconstruction = reconstructExecutedHevcGetBuffer(encoderSource);
const result = deriveAlignment16FirstMallocCapacity({ wrapperText: archive.functions.find(row => row.name === "__wrap_posix_memalign").text,
  allocatorText: archive.functions.find(row => row.name === "emscripten_builtin_malloc").text,
  frameText: archive.functions.find(row => row.name === "avcodec_default_get_buffer2").text,
  fatalInstruction: flow.inspection.actualFatalCall.originalInstruction, frameInstructionContext,
  failure: terminal.result.failedAllocation, getBufferSource: reconstruction.generated });
const postSourcePins = {}; for (const file of ownFiles) postSourcePins[file] = sha(await read(file)); assert.deepEqual(postSourcePins, sourcePins);
const proof = { recordedAt: new Date().toISOString(), status: "actual-first-malloc-fragmented-capacity-proven-not-fixed",
  flow: { path: flowPath, sha256: sha(flowBytes) }, terminal: flow.input, actualBinary: flow.inspection.binary,
  selectedArchive: record, actualFirstMallocAndFramePcJoined: true, frameInstructionContext,
  reconstructedExecutedSource: { inputPath: sourcePath, ...reconstruction }, result, sourcePins, postSourcePins, sourcePreimages,
  originalVideoRead: false, originalWasmFunctionsExecuted: 0, conversions: 0, publicAcceptance: false };
const output = "evidence/alignment16-first-malloc-capacity-2026-10-12.json";
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" }); console.log(JSON.stringify({ output, ...result }));
