import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { makeEbmlReuseSource, MATROSKADEC_SHA256, EBML_REUSE_EDITS } from "../media/ffmpeg/mpeg2-ebml-reuse-source.mjs";
import { makeEbmlReuseRecipe } from "../media/ffmpeg/mpeg2-ebml-reuse-recipe.mjs";
import { makeEbmlReuseHostedBuilder, makeAlignment16Builder, makePacketCacheOuterBuilder,
  makePacketCacheHevcWrapper } from "../media/ffmpeg/mpeg2-ebml-reuse-builder-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function reverse(recipe) { let text = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) text = text.replace(after, before); return text; }
function syntax(text) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: text, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
test("source patch refuses unpinned source and restricts reuse to block IDs with per-context close", () => {
  assert.throws(() => makeEbmlReuseSource("fake"));
  assert.match(MATROSKADEC_SHA256, /^[0-9a-f]{64}$/);
  assert.equal(EBML_REUSE_EDITS.length, 6);
  const text = EBML_REUSE_EDITS.map(row => row[1]).join("\n");
  assert.ok(text.includes("id == MATROSKA_ID_SIMPLEBLOCK || id == MATROSKA_ID_BLOCK"));
  assert.ok(text.includes("? &matroska->within_block_cache : NULL"));
  assert.ok(text.includes("ebml_free(matroska_segment, matroska);\n    within_ebml_cache_close"));
});
test("actual released Matroska source transforms and reverses byte-for-byte, including untouched read/error/padding code", async () => {
  const proof = JSON.parse(await read("evidence/mpeg2-ebml-reuse-upstream-2026-10-14.json"));
  const compressed = await readFile(path.join(root, proof.sourceArchive));
  const sha = data => createHash("sha256").update(data).digest("hex");
  assert.equal(sha(compressed), proof.compressedSha256);
  const raw = gunzipSync(compressed); assert.equal(sha(raw), proof.restoredSha256);
  const source = JSON.parse(raw).upstreamSources["libavformat/matroskadec.c"].source;
  const recipe = makeEbmlReuseSource(source); assert.equal(recipe.generatedSha256, proof.recipe.generatedSha256);
  assert.equal(reverse(recipe), source);
  for (const token of ["memset(bin->buf->data + length, 0, AV_INPUT_BUFFER_PADDING_SIZE);",
    "if ((ret = avio_read(pb, bin->data, length)) != length)", "return ret < 0 ? ret : NEEDS_CHECKING;"])
    assert.ok(recipe.generated.includes(token));
  assert.throws(() => makeEbmlReuseSource(source.replace("Matroska file demuxer", "changed")));
});
test("shell derivative reverses exactly and retains prior fixed-memory/codecs/production AVIO and controls", async () => {
  const recipe = makeEbmlReuseRecipe(await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"));
  assert.equal(reverse(recipe), recipe.parent);
  for (const token of ["realloc-avutil-smoke", "packet-first-idle-smoke", "mpeg2-ebml-reuse-smoke.c", "ffmpeg/libavformat/matroskadec.c",
    "-sALLOW_MEMORY_GROWTH=0", "-sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432", "-sASYNCIFY_STACK_SIZE=262144",
    "# Compile the preserved production AVIO/kernel", "build-mpeg2-split-encoder.sh"])
    assert.ok(recipe.generated.includes(token), token);
  assert.ok(recipe.generated.indexOf("mpeg2-ebml-reuse-source.mjs") < recipe.generated.indexOf("emconfigure ./configure"));
  assert.equal(recipe.codecSettingsChanged, false); assert.equal(recipe.heapLimitsChanged, false);
});
test("all nested build derivatives parse, retain parent gates, and admit the allocation-policy change", async () => {
  const recipe = makeEbmlReuseHostedBuilder(await read("media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"), root);
  syntax(recipe.generated);
  assert.ok(reverse(recipe).includes("private-fixed-heaps-realloc-scalar-diagnostic-not-browser-acceptance"));
  const inner = makeAlignment16Builder(await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), root);
  const outer = makePacketCacheOuterBuilder(await read("media/ffmpeg/build-mpeg2-alignment16.mjs"), root);
  const hevc = makePacketCacheHevcWrapper(await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs"), root);
  for (const derivative of [inner, outer, hevc]) syntax(derivative.generated);
  assert.ok(inner.generated.includes("makeEbmlReuseShellRecipe as makeAlignedReuseRecipe"));
  for (const token of ["actual.passed, 6", "dispatch.passed, 10", "allocatorPolicyChanged: true", "ebml.candidatePayloadAllocationCalls, 1",
    "ebml.injectedFailureCases, 4", "await unlink(ebmlSmokePath)", "fullOriginalCompleted: false", "publicAcceptance: false"])
    assert.ok(recipe.generated.includes(token), token);
});
test("reuse owns at most one idle lease, exposes logical size, delegates existing and oversized refs, never reuses aliases", async () => {
  const source = await read("media/ffmpeg/mpeg2-ebml-reuse.h");
  for (const token of ["if (*buffer || size < 64 || size > 1048640)", "return av_buffer_realloc(buffer, size)",
    "av_buffer_create(lease->data, size", "lease->capacity > cache->idle->capacity", "if (cache->closed && !cache->live)",
    "if (!cache->live) av_free(cache)", "memset(lease->data + size - 64, 0, 64)"])
    assert.ok(source.includes(token), token);
  assert.ok(!source.includes("av_buffer_ref("));
  assert.ok(!source.includes("av_malloc(1048640)"));
});
