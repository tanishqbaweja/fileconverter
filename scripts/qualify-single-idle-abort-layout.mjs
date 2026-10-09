// Exact new-binary function-body join to already decoded ABI. No Wasm instance/media.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
import { verifySingleIdleBuildEvidence, SINGLE_IDLE_DECODER_SHA } from "./lib/single-idle-browser-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file));
assert.equal(process.argv.length, 2);
const output = "evidence/mpeg2-single-idle-abort-layout-2026-10-10.json";
await assert.rejects(access(path.join(root, output)), { code: "ENOENT" });
const buildBytes = await read("evidence/mpeg2-single-idle-build-37986418102.json"), build = JSON.parse(buildBytes);
verifySingleIdleBuildEvidence(build, JSON.parse(await read("evidence/mpeg2-single-idle-build-branch-2026-10-10.json")));
const oldProofPath = "evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json", oldProofBytes = await read(oldProofPath), oldProof = JSON.parse(oldProofBytes);
const oldRaw = await read(oldProof.rawReport.path); assert.equal(sha(oldRaw), oldProof.rawReport.sha256);
const oldReport = JSON.parse(oldRaw); assert.equal(oldReport.failure, null); assert.equal(oldReport.cleanup.runtimeRemoved, true);
const oldBinary = await read(oldProof.binary.path), binaryPath = "work/mpeg2-single-idle-37986418102/within-mpeg2-split.wasm", binary = await read(binaryPath);
assert.equal(sha(oldBinary), oldProof.binary.sha256); assert.equal(sha(binary), SINGLE_IDLE_DECODER_SHA);
assert.notEqual(sha(binary), sha(oldBinary));
const selected = new Set(["av_malloc", "av_refstruct_pool_get", "emscripten_builtin_malloc", "__wrap_posix_memalign"]);
const oldMeta = readWasmFunctionMetadata(oldBinary, selected), newMeta = readWasmFunctionMetadata(binary, selected);
const functions = newMeta.map(actual => {
  const old = oldMeta.find(row => row.name === actual.name);
  assert.equal(actual.functionIndex, old.functionIndex); assert.deepEqual(actual.params, old.params); assert.deepEqual(actual.results, old.results);
  const before = oldBinary.subarray(old.bodyStart, old.bodyEnd), after = binary.subarray(actual.bodyStart, actual.bodyEnd);
  assert.deepEqual(after, before, actual.name);
  if (oldReport.inspection.selectedFunctions[actual.name])
    assert.equal(sha(before), oldReport.inspection.selectedFunctions[actual.name].originalBodySha256);
  return { name: actual.name, old, actual, bodyBytes: after.length, bodySha256: sha(after), byteExact: true, base64: after.toString("base64") };
});
const changes = ["pool_return_entry", "set_sps"];
const oldChanged = readWasmFunctionMetadata(oldBinary, new Set(changes)), newChanged = readWasmFunctionMetadata(binary, new Set(changes));
const changedFunctions = newChanged.map(actual => {
  const old = oldChanged.find(row => row.name === actual.name);
  const before = oldBinary.subarray(old.bodyStart, old.bodyEnd), after = binary.subarray(actual.bodyStart, actual.bodyEnd);
  assert.notEqual(sha(before), sha(after), actual.name);
  return { name: actual.name, old, actual, oldBodySha256: sha(before), newBodySha256: sha(after), different: true };
});
const mapBytes = await read("work/mpeg2-single-idle-37986418102/decoder-link.map"); assert.equal(sha(mapBytes), build.manifest.artifacts["decoder-link.map"]);
const symbol = (name, bytes) => {
  const matches = [...mapBytes.toString().matchAll(new RegExp("^\\s*([0-9a-f]+)\\s+([0-9a-f]+)\\s+([0-9a-f]+)\\s+" + name + "\\s*$", "gm"))];
  assert.equal(matches.length, 1); assert.equal(parseInt(matches[0][3], 16), bytes);
  return { name, address: parseInt(matches[0][1], 16), bytes, mapLine: matches[0][0].trim() };
};
const allocator = symbol("_gm_", 496), slot = symbol("within_refstruct_abort_words", 64);
assert.equal(allocator.address, oldProof.allocatorRootAddress); assert.equal(allocator.address, 1786520);
assert.equal(slot.address, 1918608);
for (const field of ["smallmap", "treemap", "dvsize", "topsize", "leastAddress", "dv", "top", "smallbins", "treebins", "footprint", "flags", "mutex", "segment"])
  assert.equal(oldProof.allocatorLayoutReferences[field].referencedInActualFunction, true, field);
const oldJs = await read("work/mpeg2-split-pipeline-37739125738/within-mpeg2-split.mjs"), newJs = await read("work/mpeg2-single-idle-37986418102/within-mpeg2-split.mjs");
assert.deepEqual(newJs, oldJs); assert.equal(sha(newJs), build.manifest.artifacts["within-mpeg2-split.mjs"]);
const pins = {};
for (const file of ["scripts/qualify-single-idle-abort-layout.mjs", "scripts/lib/wasm-function-metadata.mjs", "scripts/lib/wasm-stack-symbols.mjs",
  "scripts/lib/single-idle-browser-recipe.mjs", "scripts/lib/mpeg2-late-allocator-abort-adapter.mjs", "scripts/lib/mpeg2-late-abort-adapter.mjs",
  "scripts/lib/bounded-wasm-abort-capture.mjs", "scripts/lib/late-refstruct-abort-snapshot.mjs", "scripts/lib/late-pool-abort-capture.mjs",
  "scripts/lib/late-pool-allocator-abort-capture.mjs", "scripts/lib/dlmalloc-free-header-inspection.mjs"]) pins[file] = sha(await read(file));
const archiveBytes = Buffer.from(JSON.stringify({ functions, changedFunctions })), compressed = gzipSync(archiveBytes, { level: 9 });
assert.ok(archiveBytes.length < 32768); assert.deepEqual(gunzipSync(compressed), archiveBytes);
const archivePath = "outputs/reports/2026-10-10-single-idle-qualified-function-bodies.json.gz";
await writeFile(path.join(root, archivePath), compressed, { flag: "wx" });
const proof = { recordedAt: new Date().toISOString(), status: "new-binary-abort-ABI-byte-exact-qualified-not-conversion-acceptance",
  binary: { path: binaryPath, bytes: binary.length, sha256: sha(binary) }, buildProofSha256: sha(buildBytes),
  previousQualification: { path: oldProofPath, sha256: sha(oldProofBytes), rawPath: oldProof.rawReport.path, rawSha256: sha(oldRaw), binarySha256: sha(oldBinary) },
  mapSha256: sha(mapBytes), allocator, slot, functions: functions.map(({ base64, ...row }) => ({ ...row, retainedBodyInArchive: Boolean(base64) })),
  changedFunctions, allocatorLayoutReferences: oldProof.allocatorLayoutReferences, decoderJavascriptByteExact: true, javascriptSha256: sha(newJs),
  archive: { path: archivePath, bytes: compressed.length, sha256: sha(compressed), restoredBytes: archiveBytes.length, restoredSha256: sha(archiveBytes) }, sourcePins: pins,
  qualificationMethod: "Actual new/old function byte/index/type comparison, new actual linker map, exact previous decoded allocator proof and JS binding; no redownload/re-disassembly",
  instantiated: false, wasmFunctionsExecuted: 0, browserConversions: 0, originalRead: false,
  dynamicFreeCapacityMeasured: false, actualFullSourceFailureResolved: false, publicAcceptance: false };
await writeFile(path.join(root, output), JSON.stringify(proof, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, status: proof.status, allocator: allocator.address, slot: slot.address, changedFunctions: changedFunctions.map(row => row.name) }));
