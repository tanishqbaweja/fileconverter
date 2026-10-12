import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { makePacketCacheExportRecipe, makePacketCacheControlBrowserFactory, makePacketCacheControlCaller, PACKET_CACHE_DECODER_SHA256 } from "../scripts/lib/packet-cache-control-recipe.mjs";
import { verifyPacketCacheNativeEnvelope } from "../scripts/lib/packet-cache-native-envelope.mjs";
import { createCompositeAllocationAbortCapture } from "../scripts/lib/packet-cache-composite-abort-capture.mjs";
import { readWasmFunctionMetadata } from "../scripts/lib/wasm-function-metadata.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function parse(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
test("packet observers only change compiled identity, wrapper index and import; unrelated packet abort does not read heap", async () => {
  const prior = await read("scripts/lib/hevc-plane-attempt-abort-capture.mjs");
  const expected = prior.replace("07ff8c19e9f58205f21a9cd10f6d7f0e0fb8f1e7086b810818724846117d51e4", PACKET_CACHE_DECODER_SHA256).replaceAll("4472", "4473");
  const actual = await read("scripts/lib/packet-cache-attempt-abort-capture.mjs"); assert.equal(actual.trimEnd(), expected.trimEnd()); parse(actual);
  const composite = await read("scripts/lib/packet-cache-composite-abort-capture.mjs");
  assert.equal(composite.trimEnd(), (await read("scripts/lib/hevc-plane-composite-abort-capture.mjs"))
    .replace("./hevc-plane-attempt-abort-capture.mjs", "./packet-cache-attempt-abort-capture.mjs").replaceAll("4472", "4473").trimEnd()); parse(composite);
  let coreReads = 0, emitted;
  const capture = createCompositeAllocationAbortCapture({ qualifiedBinarySha256: PACKET_CACHE_DECODER_SHA256,
    getCore: () => { coreReads++; throw new Error("Unqualified stack must not read heap"); }, emit: row => { emitted = row; } });
  capture.onAbort("unrelated packet failure");
  assert.equal(coreReads, 0); assert.equal(emitted.validatedScalarWords, 0); assert.equal(emitted.allocatorFreeBlocks, null);
  assert.equal(emitted.failedIndividualAllocationBytes, null); assert.equal(emitted.noHeapCopy, true);
});
test("actual binary typed indices and reversible callers preserve original browser privacy/cleanup/fixed-heap/cap gates", async () => {
  const indices = { av_buffer_allocz: 4188, av_malloc: 4313, emscripten_builtin_malloc: 4437, __wrap_posix_memalign: 4473,
    avcodec_default_get_buffer2: 709, alloc_frame: 2061, hevc_receive_frame: 1981, sbrk: 4442, av_refstruct_pool_get: 4381 };
  const binary = await readFile(path.join(root, "work/mpeg2-packet-cache-38206263853/within-mpeg2-split.wasm"));
  assert.equal(sha(binary), PACKET_CACHE_DECODER_SHA256);
  const functions = readWasmFunctionMetadata(binary, new Set(Object.keys(indices))); assert.equal(functions.length, 9);
  for (const row of functions) assert.equal(row.functionIndex, indices[row.name], row.name);
  const recipes = [makePacketCacheExportRecipe(await read("scripts/lib/refstruct-export-only-control.mjs")),
    makePacketCacheControlBrowserFactory(await read("scripts/lib/direct-buffer-control-browser-recipe.mjs")),
    makePacketCacheControlCaller(await read("scripts/check-allocation-attempt-abort-control.mjs"), root)];
  for (const recipe of recipes) {
    parse(recipe.generated); assert.equal(recipe.publicAcceptance, false);
    let restored = recipe.generated;
    for (const [before, after] of recipe.edits.toReversed()) restored = restored.replaceAll(after, before);
    assert.equal(sha(restored), recipe.previousSourceSha256);
  }
  for (const gate of ["files.length <= 128", "bytes.length <= 2097152", "await runtime.close()", "allCodeDataTypesImportsTablesMemoryExact", "syntheticOnly"])
    assert.ok((recipes[0].generated + recipes[2].generated).includes(gate), gate);
  assert.ok(recipes[2].generated.includes("nativeSourceEnvelopePost"));
  assert.ok(recipes[1].generated.includes("packet-cache-composite-abort-capture.mjs"));
});
test("all 72 actual native preimages/current/post/workflow sources are hash-bound independently under unchanged caps", async () => {
  const bytes = await readFile(path.join(root, "evidence/mpeg2-packet-cache-build-38206263853.json")), build = JSON.parse(bytes);
  const branch = JSON.parse(await read("evidence/mpeg2-packet-cache-build-branch-2026-10-12-warning-fix.json"));
  const proof = await verifyPacketCacheNativeEnvelope(root, build, bytes, branch);
  assert.equal(proof.sourceCount, 72); assert.equal(proof.allExecutedNativePreimagesVerified, true);
  assert.equal(proof.unchanged128File2MiBEnvelopeCaps, true); assert.equal(proof.publicAcceptance, false);
  await assert.rejects(verifyPacketCacheNativeEnvelope(root, build, Buffer.from("wrong"), branch));
  await assert.rejects(verifyPacketCacheNativeEnvelope(root, { ...build, manifest: { ...build.manifest, sources: {} } }, bytes, branch));
});
