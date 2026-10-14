// Fresh candidate binding. Preserve existing scalar/header/callback guards and
// retain the separate 93-source native seal; never substitute old Wasm indices.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { readWasmMemoryLimits } from "./wasm-memory-limits.mjs";
import { readWasmFunctionMetadata } from "./wasm-function-metadata.mjs";
export const EBML_DECODER_SHA256 = "7037563225465b6bff6f3f17eccc9a2f42033e435d3473101efb631b6736fe25";
export const EBML_TOOL_DIRECTORY = "work/mpeg2-ebml-reuse-38608791023";
const previousSha = "eb45bb276b139f0c0404079c2087d06dfa0f629c400d3f18f5a28ead78521e3c";
export function exactPatch(source, edits) {
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before.slice(0, 160)); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reversed.split(after).length, 2, after.slice(0, 160)); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source);
  return { generated, generatedSha256: sha(generated), parentSha256: sha(source), edits, publicAcceptance: false };
}
export async function verifyEbmlNative(root) {
  const read = file => readFile(path.join(root, file));
  const proofPath = "evidence/ebml-reuse-native-38608791023.json", proofBytes = await read(proofPath), proof = JSON.parse(proofBytes);
  const buildPath = "evidence/mpeg2-ebml-reuse-build-38608791023.json", buildBytes = await read(buildPath), build = JSON.parse(buildBytes);
  const branchPath = "evidence/mpeg2-ebml-reuse-build-branch-2026-10-14.json", branch = JSON.parse(await read(branchPath));
  assert.equal(sha(buildBytes), proof.proof.sha256); assert.equal(proof.executedHead, build.run.headSha);
  assert.equal(build.run.headSha, branch.commit); assert.equal(build.run.status, "completed"); assert.equal(build.run.conclusion, "success");
  assert.equal(proof.sourceCount, 93); assert.ok(proof.sourceCount <= 128);
  assert.equal(proof.allSourcesMatchedExecutedGitHead, true); assert.equal(proof.workflowCanonicalDiffOnly, true);
  assert.deepEqual(proof.sourcePins, build.manifest.sources); assert.deepEqual(proof.currentSourcePins, proof.postSourcePins);
  const zipped = await read(proof.archive.path); assert.equal(zipped.length, proof.archive.bytes); assert.equal(sha(zipped), proof.archive.sha256);
  const raw = gunzipSync(zipped, { maxOutputLength: 2097152 }); assert.equal(raw.length, proof.archive.restoredBytes); assert.equal(sha(raw), proof.archive.restoredSha256);
  const archive = JSON.parse(raw); assert.deepEqual(archive.sourcePins, proof.sourcePins); assert.deepEqual(archive.currentSourcePins, proof.currentSourcePins);
  assert.deepEqual(Object.keys(archive.sourcePreimages).sort(), Object.keys(proof.sourcePins).sort());
  for (const [file, expected] of Object.entries(proof.sourcePins)) {
    assert.match(file, /^(?:(?:media\/ffmpeg\/|scripts\/lib\/|\.github\/workflows\/)[a-zA-Z0-9_.\/-]+|tests\/mpeg2-(?:realloc-attempt|ebml-reuse)\.test\.mjs)$/);
    assert.ok(file.split("/").every(part => part && part !== "." && part !== ".."));
    const entry = archive.sourcePreimages[file]; assert.equal(entry.encoding, "base64");
    const bytes = Buffer.from(entry.data, "base64"); assert.equal(bytes.toString("base64"), entry.data); assert.equal(sha(bytes), expected);
    const current = sha(await read(file)); assert.equal(current, proof.currentSourcePins[file], file);
    if (file === branch.workflow.path) {
      assert.equal(expected, branch.workflow.generatedSha256); assert.equal(bytes.toString(), branch.workflow.generatedExactSource);
      assert.equal(current, branch.workflow.canonicalSha256);
    } else assert.equal(current, expected);
  }
  assert.equal(sha(Buffer.from(proof.ownSource.preimage, "base64")), proof.ownSource.sha256);
  assert.equal(sha(await read(proof.ownSource.path)), proof.ownSource.sha256);
  assert.deepEqual(proof.actualEbmlReuse, build.manifest.ebmlReuse);
  const smoke = build.manifest.ebmlReuse.actualWasmLibavutil;
  assert.equal(smoke.reuseIterations, 200000); assert.equal(smoke.injectedFailureCases, 4); assert.equal(smoke.maximumIdleLeases, 1);
  assert.equal(smoke.maximumIdleCapacityBytes, 1048640); assert.equal(smoke.candidatePayloadAllocationCalls, 1);
  for (const field of ["logicalSizesPreserved", "aliasesAndDeferredClose", "existingReallocContentPreserved",
    "oversizedAndZeroDelegate", "ownedAllocationsBalanced"]) assert.equal(smoke[field], true);
  assert.equal(build.files.length, 20);
  for (const row of build.files) {
    assert.ok(!row.file.includes("/") && !row.file.includes("\\"));
    const bytes = await read(`${EBML_TOOL_DIRECTORY}/${row.file}`); assert.equal(bytes.length, row.bytes); assert.equal(sha(bytes), row.sha256);
  }
  const binary = await read(`${EBML_TOOL_DIRECTORY}/within-mpeg2-split.wasm`);
  assert.equal(sha(binary), EBML_DECODER_SHA256);
  assert.deepEqual(readWasmMemoryLimits(binary), [{ imported: true, initialPages: 512, maximumPages: 512, shared: true }]);
  assert.deepEqual(proof.layout, { _gm_: { address: 1786760, bytes: 496 }, within_allocator_attempt_words: { address: 1918848, bytes: 64 },
    within_realloc_attempt_words: { address: 1918912, bytes: 64 }, within_refstruct_abort_words: { address: 1918976, bytes: 64 } });
  const expected = new Map([["av_buffer_allocz", [1,1]], ["av_malloc", [1,1]], ["av_refstruct_pool_get", [1,1]], ["mpeg2_packets", [2,1]],
    ["__wrap_posix_memalign", [2,1]], ["sbrk", [1,1]], ["emscripten_builtin_malloc", [1,1]], ["emscripten_builtin_realloc", [2,1]],
    ["av_buffer_realloc", [2,1]], ["__wrap_av_realloc", [2,1]], ["__wrap_av_buffer_realloc", [2,1]]]);
  const functions = readWasmFunctionMetadata(binary, new Set(expected.keys())).map(row => {
    const [params, results] = expected.get(row.name);
    assert.deepEqual(row.params, Array(params).fill("i32")); assert.deepEqual(row.results, Array(results).fill("i32"));
    return { ...row, bodySha256: sha(binary.subarray(row.bodyStart, row.bodyEnd)) };
  });
  assert.equal(functions.length, expected.size);
  return { binary, build, buildBytes, buildPath, branch, branchPath, proof, proofPath, functions,
    envelope: { path: proofPath, sha256: sha(proofBytes), sourceCount: 93, archive: proof.archive,
      currentSourcePins: proof.currentSourcePins, allExecutedNativePreimagesVerified: true,
      maximumFiles: 128, maximumRestoredBytes: 2097152, publicAcceptance: false } };
}
export async function makeEbmlObservers(root, native) {
  assert.equal(sha(native.binary), EBML_DECODER_SHA256);
  const indices = Object.fromEntries(native.functions.map(row => [row.name, row.functionIndex]));
  const idx = name => { assert.ok(Number.isInteger(indices[name])); return indices[name]; };
  const files = {}, recipes = {};
  for (const file of ["realloc-attempt-abort-capture.mjs", "realloc-composite-abort-capture.mjs",
    "realloc-allocation-abort-capture.mjs", "realloc-aligned-attempt-snapshot.mjs"]) {
    const source = await readFile(path.join(root, "scripts/lib", file), "utf8");
    const edits = [];
    if (file === "realloc-attempt-abort-capture.mjs") edits.push([previousSha, EBML_DECODER_SHA256]);
    if (file === "realloc-composite-abort-capture.mjs") {
      edits.push(["[4475,4440,4437,4442]", JSON.stringify([idx("__wrap_av_realloc"), idx("emscripten_builtin_realloc"), idx("emscripten_builtin_malloc"), idx("sbrk")])]);
      edits.push(["[4474,4192]", JSON.stringify([idx("__wrap_av_buffer_realloc"), idx("av_buffer_realloc")])]);
    }
    if (file === "realloc-allocation-abort-capture.mjs") {
      edits.push(["[4189,4314,4473,4442]", JSON.stringify([idx("av_buffer_allocz"),idx("av_malloc"),idx("__wrap_posix_memalign"),idx("sbrk")])]);
      edits.push(["[4381,4314]", JSON.stringify([idx("av_refstruct_pool_get"),idx("av_malloc")])]);
      edits.push(["[4471,4314,4473,4442]", JSON.stringify([idx("mpeg2_packets"),idx("av_malloc"),idx("__wrap_posix_memalign"),idx("sbrk")])]);
    }
    const recipe = edits.length ? exactPatch(source, edits) : { generated: source, generatedSha256: sha(source), parentSha256: sha(source), edits: [] };
    files[file] = recipe.generated; recipes[file] = recipe;
  }
  return { files, recipes, typedFunctions: native.functions, nativeEnvelope: native.envelope, oldMappingsUsed: false, publicAcceptance: false };
}
