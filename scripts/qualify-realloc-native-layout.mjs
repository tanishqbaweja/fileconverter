// Static actual-binary ABI only. Runtime decoder binding/fatal path still require
// browser control; never claim that link-map addresses alone execute correctly.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
import { readWasmFunctionNames } from "./lib/wasm-stack-symbols.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { verifyReallocNativeEnvelope } from "./lib/realloc-native-envelope.mjs";
assert.equal(process.argv.length, 2);
const root = path.resolve(import.meta.dirname, ".."), runId = "38526781934", read = file => readFile(path.join(root, file));
const proofPath = `evidence/mpeg2-realloc-attempt-build-${runId}.json`, buildBytes = await read(proofPath), build = JSON.parse(buildBytes);
const branchPath = "evidence/mpeg2-realloc-attempt-build-branch-2026-10-14-recursion-fix.json", branchBytes = await read(branchPath), branch = JSON.parse(branchBytes);
const envelope = await verifyReallocNativeEnvelope(root, build, buildBytes, branch);
const slot = `work/mpeg2-realloc-attempt-${runId}`, binary = await read(`${slot}/within-mpeg2-split.wasm`), mapBytes = await read(`${slot}/decoder-link.map`);
assert.equal(sha(binary), "eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c");
assert.equal(sha(binary), build.manifest.artifacts["within-mpeg2-split.wasm"]);
assert.equal(sha(mapBytes), build.files.find(x => x.file === "decoder-link.map").sha256);
const memories = readWasmMemoryLimits(binary); assert.deepEqual(memories, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
const layout = {};
for (const name of ["_gm_", "within_allocator_attempt_words", "within_realloc_attempt_words", "within_refstruct_abort_words"]) {
  const rows = [...mapBytes.toString().matchAll(new RegExp(`^\\s+([0-9a-f]+)\\s+([0-9a-f]+)\\s+([0-9a-f]+)\\s+${name}$`, "gm"))];
  assert.equal(rows.length, 1); const row = rows[0]; layout[name] = { address: parseInt(row[1], 16), bytes: parseInt(row[3], 16) };
  assert.ok(layout[name].address > 0 && layout[name].address + layout[name].bytes <= 33554432);
}
assert.deepEqual(layout.within_realloc_attempt_words, { address: 1918912, bytes: 64 });
assert.equal(layout._gm_.address, 1786760); assert.equal(layout.within_allocator_attempt_words.address, 1918848);
assert.equal(layout.within_refstruct_abort_words.address, 1918976);
const expected = new Map([["__wasm_call_ctors", [55,0,0]], ["ebml_parse", [213,3,1]], ["matroska_parse_cluster", [223,1,1]],
  ["av_buffer_realloc", [4192,2,1]], ["emscripten_builtin_malloc", [4437,1,1]], ["emscripten_builtin_realloc", [4440,2,1]],
  ["sbrk", [4442,1,1]], ["__wrap_av_buffer_realloc", [4474,2,1]], ["__wrap_av_realloc", [4475,2,1]]]);
const functions = readWasmFunctionMetadata(binary, new Set(expected.keys())).map(row => {
  const [index, params, results] = expected.get(row.name);
  assert.equal(row.functionIndex, index); assert.deepEqual(row.params, Array(params).fill("i32")); assert.deepEqual(row.results, Array(results).fill("i32"));
  return { ...row, bodySha256: sha(binary.subarray(row.bodyStart, row.bodyEnd)) };
});
const names = readWasmFunctionNames(binary), binding = [...names].filter(([, name]) => name === "within_bind_realloc_attempt_slot"); assert.equal(binding.length, 1); assert.equal(binding[0][0], 17);
// This exact straight i32.const address/call pair joins the compiled constructor
// to the map's64-byte slot. It is not a dynamic constructor execution claim.
function signedLeb32(value) {
  const bytes = []; let more = true;
  while (more) { let word = value & 127; value >>= 7; more = !((value === 0 && !(word & 64)) || (value === -1 && (word & 64))); if (more) word |= 128; bytes.push(word); }
  return bytes;
}
const ctor = functions.find(x => x.name === "__wasm_call_ctors"), pattern = Buffer.from([0x41, ...signedLeb32(layout.within_realloc_attempt_words.address), 0x10, 17]);
assert.ok(binary.subarray(ctor.bodyStart, ctor.bodyEnd).includes(pattern), "Actual typed constructor must bind this slot to the actual import");
const glue = await read(`${slot}/within-mpeg2-split.mjs`); assert.equal(sha(glue), build.manifest.artifacts["within-mpeg2-split.mjs"]);
for (const token of ['Module["withinReallocAttemptAddress"]=address', 'Module["withinReallocAttemptWords"]=16']) assert.ok(glue.toString().includes(token), token);
const own = "scripts/qualify-realloc-native-layout.mjs", ownBytes = await read(own);
const output = `evidence/realloc-native-layout-${runId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), status: "static-actual-decoder-realloc-layout-verified-not-runtime-browser-qualification",
  build: { path: proofPath, sha256: sha(buildBytes) }, branch: { path: branchPath, sha256: sha(branchBytes) }, nativeEnvelope: envelope,
  binary: { path: `${slot}/within-mpeg2-split.wasm`, bytes: binary.length, sha256: sha(binary) }, memories, layout, functions,
  constructor: { binderFunctionIndex: 17, typedBodySlotCallVerified: true, glueModuleFieldsVerified: true, runtimeDecoderBindingVerified: false },
  originalRead: false, conversions: 0, actualOriginalFailedRequestProven: false, browserFailurePathQualified: false, fullOriginalAcceptance: false, publicAcceptance: false,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, sourceCount: 86, slotAddress: layout.within_realloc_attempt_words.address, typedFunctions: functions.length, runtimeBrowserQualified: false }));
