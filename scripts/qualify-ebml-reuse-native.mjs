// Actual source-bound native controls and static ABI. Not browser fidelity,
// runtime fatal-hook coverage, original-file reliability, or memory acceptance.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
import { readWasmFunctionNames } from "./lib/wasm-stack-symbols.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { EBML_REUSE_NATIVE_FILES } from "../media/ffmpeg/mpeg2-ebml-reuse-builder-recipe.mjs";
assert.equal(process.argv.length, 3);
const runId = process.argv[2]; assert.match(runId, /^\d{8,}$/);
const root = path.resolve(import.meta.dirname, ".."), execute = promisify(execFile);
const read = file => readFile(path.join(root, file));
const proofPath = `evidence/mpeg2-ebml-reuse-build-${runId}.json`, proofBytes = await read(proofPath), build = JSON.parse(proofBytes);
const branch = JSON.parse(await read("evidence/mpeg2-ebml-reuse-build-branch-2026-10-14.json"));
assert.equal(build.run.status, "completed"); assert.equal(build.run.conclusion, "success");
assert.equal(build.run.headSha, branch.commit); assert.equal(branch.remoteVerified, true);
const parent = JSON.parse(await read("evidence/mpeg2-realloc-attempt-build-38526781934.json"));
const sourcePins = build.manifest.sources, expectedFiles = [...new Set([...Object.keys(parent.manifest.sources), ...EBML_REUSE_NATIVE_FILES])].sort();
assert.deepEqual(Object.keys(sourcePins).sort(), expectedFiles); assert.equal(expectedFiles.length, 93); assert.ok(expectedFiles.length <= 128);
const sourcePreimages = {}, currentSourcePins = {};
for (const [file, expected] of Object.entries(sourcePins)) {
  assert.match(file, /^(?:(?:media\/ffmpeg\/|scripts\/lib\/|\.github\/workflows\/)[a-zA-Z0-9_.\/-]+|tests\/mpeg2-(?:realloc-attempt|ebml-reuse)\.test\.mjs)$/);
  assert.ok(file.split("/").every(part => part && part !== "." && part !== ".."));
  const executed = (await execute("git", ["show", `${build.run.headSha}:${file}`],
    { cwd: root, windowsHide: true, encoding: "buffer", timeout: 30000, maxBuffer: 262144 })).stdout;
  assert.equal(sha(executed), expected); sourcePreimages[file] = { encoding: "base64", data: executed.toString("base64") };
  currentSourcePins[file] = sha(await read(file));
  if (file === branch.workflow.path) {
    assert.equal(expected, branch.workflow.generatedSha256); assert.equal(executed.toString(), branch.workflow.generatedExactSource);
    assert.equal(currentSourcePins[file], branch.workflow.canonicalSha256);
  } else {
    assert.equal(currentSourcePins[file], expected, file);
    if (parent.manifest.sources[file]) assert.equal(expected, parent.manifest.sources[file], "Preserve qualified parent source: " + file);
  }
}
const slot = `work/mpeg2-ebml-reuse-${runId}`;
for (const row of build.files) {
  const data = await read(`${slot}/${row.file}`); assert.equal(data.length, row.bytes); assert.equal(sha(data), row.sha256);
}
const binary = await read(`${slot}/within-mpeg2-split.wasm`), mapBytes = await read(`${slot}/decoder-link.map`);
assert.equal(sha(binary), build.manifest.artifacts["within-mpeg2-split.wasm"]);
assert.notEqual(sha(binary), parent.manifest.artifacts["within-mpeg2-split.wasm"]);
const memories = readWasmMemoryLimits(binary);
assert.deepEqual(memories, [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
assert.equal(build.manifest.artifacts["split-encoder.wasm"], parent.manifest.artifacts["split-encoder.wasm"]);
const layout = {};
for (const name of ["_gm_", "within_allocator_attempt_words", "within_realloc_attempt_words", "within_refstruct_abort_words"]) {
  const rows = [...mapBytes.toString().matchAll(new RegExp(`^\\s+([0-9a-f]+)\\s+([0-9a-f]+)\\s+([0-9a-f]+)\\s+${name}$`, "gm"))];
  assert.equal(rows.length, 1);
  layout[name] = { address: parseInt(rows[0][1], 16), bytes: parseInt(rows[0][3], 16) };
  assert.ok(layout[name].address > 0 && layout[name].address + layout[name].bytes <= 33554432);
  assert.equal(layout[name].bytes, name === "_gm_" ? 496 : 64);
}
const expectedTypes = new Map([["__wasm_call_ctors", [0,0]], ["ebml_parse", [3,1]], ["matroska_parse_cluster", [1,1]],
  ["av_buffer_realloc", [2,1]], ["emscripten_builtin_malloc", [1,1]], ["emscripten_builtin_realloc", [2,1]],
  ["sbrk", [1,1]], ["__wrap_av_buffer_realloc", [2,1]], ["__wrap_av_realloc", [2,1]], ["within_ebml_release", [2,0]]]);
const functions = readWasmFunctionMetadata(binary, new Set(expectedTypes.keys())).map(row => {
  const [params, results] = expectedTypes.get(row.name);
  assert.deepEqual(row.params, Array(params).fill("i32")); assert.deepEqual(row.results, Array(results).fill("i32"));
  return { ...row, bodySha256: sha(binary.subarray(row.bodyStart, row.bodyEnd)) };
});
assert.equal(functions.length, expectedTypes.size);
const binding = [...readWasmFunctionNames(binary)].filter(([, name]) => name === "within_bind_realloc_attempt_slot");
assert.equal(binding.length, 1);
function signedLeb32(value) {
  const bytes = []; let more = true;
  while (more) { let word = value & 127; value >>= 7; more = !((value === 0 && !(word & 64)) || (value === -1 && (word & 64))); if (more) word |= 128; bytes.push(word); }
  return bytes;
}
function unsignedLeb32(value) {
  const bytes = [];
  do { let word = value & 127; value >>>= 7; if (value) word |= 128; bytes.push(word); } while (value);
  return bytes;
}
const ctor = functions.find(row => row.name === "__wasm_call_ctors");
assert.ok(binary.subarray(ctor.bodyStart, ctor.bodyEnd).includes(Buffer.from([0x41, ...signedLeb32(layout.within_realloc_attempt_words.address),
  0x10, ...unsignedLeb32(binding[0][0])])));
const glue = await read(`${slot}/within-mpeg2-split.mjs`);
assert.equal(sha(glue), build.manifest.artifacts["within-mpeg2-split.mjs"]);
for (const token of ['Module["withinReallocAttemptAddress"]=address', 'Module["withinReallocAttemptWords"]=16']) assert.ok(glue.toString().includes(token));
const raw = Buffer.from(JSON.stringify({ sourcePins, sourcePreimages, currentSourcePins, workflowCanonicalDiffOnly: true }));
assert.ok(raw.length <= 2097152);
const zipped = gzipSync(raw, { level: 9 }); assert.deepEqual(gunzipSync(zipped), raw);
const archivePath = `outputs/reports/ebml-reuse-native-sources-${runId}.json.gz`;
await writeFile(path.join(root, archivePath), zipped, { flag: "wx" }); assert.equal(sha(await read(archivePath)), sha(zipped));
const postSourcePins = {};
for (const file of Object.keys(sourcePins)) postSourcePins[file] = sha(await read(file));
assert.deepEqual(postSourcePins, currentSourcePins);
const own = "scripts/qualify-ebml-reuse-native.mjs", ownBytes = await read(own);
const output = `evidence/ebml-reuse-native-${runId}.json`;
await writeFile(path.join(root, output), JSON.stringify({ recordedAt: new Date().toISOString(), scope: "actual-native-ebml-reuse-controls-and-static-ABI-not-browser-acceptance",
  proof: { path: proofPath, sha256: sha(proofBytes) }, executedHead: build.run.headSha,
  sourceCount: expectedFiles.length, allSourcesMatchedExecutedGitHead: true, workflowCanonicalDiffOnly: true,
  sourcePins, currentSourcePins, postSourcePins, archive: { path: archivePath, bytes: zipped.length, sha256: sha(zipped), restoredBytes: raw.length, restoredSha256: sha(raw) },
  decoder: { sha256: sha(binary), bytes: binary.length, memories }, layout, functions, reallocBindingImportIndex: binding[0][0],
  actualEbmlReuse: build.manifest.ebmlReuse, allTwentyToolsMatched: build.files.length === 20,
  actualReallocControl: build.manifest.reallocAttempt, constructorStaticBindingVerified: true,
  nativeLifecyclePassed: true, runtimeBrowserHookQualified: false, browserConversions: 0, originalRead: false,
  fullOriginalCompleted: false, memoryAcceptance: false, speedGainProven: false, publicAcceptance: false,
  ownSource: { path: own, sha256: sha(ownBytes), preimage: ownBytes.toString("base64") } }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ output, sourceCount: expectedFiles.length, archiveBytes: zipped.length,
  decoderSha256: sha(binary), lifecycle: build.manifest.ebmlReuse.actualWasmLibavutil, layout,
  functions: functions.map(({ name, functionIndex }) => ({ name, functionIndex })) }));
