import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { makeMvfArenaRefstruct, reverseMvfArenaRefstruct, makeMvfArenaHevc, reverseMvfArenaHevc } from "../media/ffmpeg/mpeg2-mvf-arena-source.mjs";
import { makeMvfArenaRecipe } from "../media/ffmpeg/mpeg2-mvf-arena-recipe.mjs";
import { makeMvfArenaHostedBuilder, makeAlignment16Builder, makePacketCacheOuterBuilder,
  makePacketCacheHevcWrapper } from "../media/ffmpeg/mpeg2-mvf-arena-builder-recipe.mjs";
import { makeAlignment16Workflow, makeMvfArenaBranchCaller, makeMvfArenaCollector } from "../scripts/lib/mvf-arena-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function reverse(recipe) { let source = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) source = source.replace(after, before); return source; }
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
test("MVF transformation requires the actual executed parent and reverses every edit", async () => {
  const proof = JSON.parse(await read("evidence/mvf-arena-source-2026-10-15.json"));
  const hash = bytes => createHash("sha256").update(bytes).digest("hex");
  const compressed = await readFile(path.join(root, proof.archive.path)); assert.equal(hash(compressed), proof.archive.sha256);
  const raw = gunzipSync(compressed); assert.equal(hash(raw), proof.archive.restoredSha256);
  const archive = JSON.parse(raw), source = archive.parentRefstruct; assert.equal(hash(source), proof.parentRefstructSha256);
  const recipe = makeMvfArenaRefstruct(source); assert.equal(reverseMvfArenaRefstruct(recipe.generated), source);
  assert.throws(() => makeMvfArenaRefstruct(source + "\n"));
  assert.throws(() => reverseMvfArenaRefstruct(recipe.generated.replace("index < 6", "index < 5")));
  assert.throws(() => makeMvfArenaHevc("unqualified source"));
  assert.equal(recipe.maximumRawSlots, 6); assert.equal(recipe.maximumReservedBytes, 8388608);
  for (const key of ["logicalSizesChanged", "referenceSemanticsChanged", "idleAdmissionChanged", "codecSettingsChanged", "heapLimitsChanged", "publicAcceptance"])
    assert.equal(recipe[key], false);
  for (const token of ["sizeof(size_t) != 4 || REFCOUNT_OFFSET != 16", "av_malloc(stride * 6)",
    "return av_refstruct_alloc_ext(pool->size", "within_mvf_release_raw(pool, ref)", "av_assert0(!pool->within_mvf_used)"])
    assert.ok(recipe.generated.includes(token), token);
  // Preserve final-reference return/cache policy verbatim, including all locks.
  const start = source.indexOf("static void pool_return_entry("), end = source.indexOf("static void pool_reset_entry(", start);
  assert.ok(start >= 0 && end > start); assert.ok(recipe.generated.includes(source.slice(start, end)));
  assert.equal(reverseMvfArenaHevc(archive.hevcRecipe.generated), archive.hevcRecipe.edits.reduceRight((text, [before, after]) => text.replace(after, before), archive.hevcRecipe.generated));
  assert.ok(archive.hevcRecipe.generated.includes("pool_flags & WITHIN_HEVC_AUXILIARY_SINGLE_IDLE"));
  assert.ok(archive.hevcRecipe.generated.includes("l->rpl_tab_pool = av_refstruct_pool_alloc(ctb_count   * sizeof(RefPicListTab), pool_flags);"));
});
test("MVF build retains all parent controls, same heap/codecs and real source-linked Wasm smoke", async () => {
  const recipe = makeMvfArenaRecipe(await read("media/ffmpeg/build-mpeg2-split-pipeline.sh")); assert.equal(reverse(recipe), recipe.parent);
  for (const token of ["mpeg2-mvf-arena-smoke.c", "mpeg2-ebml-reuse-smoke.c", "realloc-avutil-smoke", "single-idle-smoke", "alignment16-smoke",
    '-I"${BUILD_ROOT}/ffmpeg"', "-sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432", "-sALLOW_MEMORY_GROWTH=0", "build-mpeg2-split-encoder.sh"])
    assert.ok(recipe.generated.includes(token), token);
  assert.ok(recipe.generated.indexOf("mpeg2-mvf-arena-source.mjs") < recipe.generated.indexOf("emconfigure ./configure"));
});
test("all nested builders parse and explicitly reverse MVF before the exact old source gate", async () => {
  const inner = makeAlignment16Builder(await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), root);
  const hosted = makeMvfArenaHostedBuilder(await read("media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"), root);
  const outer = makePacketCacheOuterBuilder(await read("media/ffmpeg/build-mpeg2-alignment16.mjs"), root);
  const hevc = makePacketCacheHevcWrapper(await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs"), root);
  for (const recipe of [inner, hosted, outer, hevc]) syntax(recipe.generated);
  assert.ok(inner.generated.includes("reverseSingleIdleRefstruct(reverseMvfArenaRefstruct(actualRefstruct))"));
  // Evaluate ONLY the nested edit declaration to prove it applies to real parent,
  // not merely to an unevaluated string. No builder/process/media is launched.
  const declaration = inner.generated.slice(inner.generated.indexOf("const edits = ["), inner.generated.indexOf("let generated = prior;"));
  const { pathToFileURL } = await import("node:url");
  const edits = Function("root", "path", "pathToFileURL", declaration + "return edits;")(root, path, pathToFileURL);
  let deepest = await read("media/ffmpeg/build-mpeg2-single-idle.mjs");
  for (const [before, after] of edits) { assert.equal(deepest.split(before).length, 2); deepest = deepest.replace(before, after); }
  syntax(deepest);
  assert.ok(deepest.includes("sha(reverseSingleIdleRefstruct(reverseMvfArenaRefstruct(actualRefstruct)))"));
  for (const token of ["mvf.constructorFailureCases, 2", "mvf.initErrorFlagCases, 4", "actual.passed, 6", "dispatch.passed, 10",
    "ebml.candidatePayloadAllocationCalls, 1", "publicAcceptance: false", "await unlink(mvfSmokePath)"])
    assert.ok(hosted.generated.includes(token), token);
});
test("native lifecycle smoke covers raw slots, overflow, aliases, errors, zeroing and final cleanup", async () => {
  const smoke = await read("media/ffmpeg/mpeg2-mvf-arena-smoke.c");
  for (const token of ['#include "libavutil/refstruct.c"', "pool->within_mvf_used == 63", "i < 7", "i < 200000", "stage <= 2", "bits < 4",
    "av_refstruct_pool_uninit(&pool); assert(!pool && c.closed == 0)", "free_calls + 2 == allocation_calls", "active_allocations() == 0"])
    assert.ok(smoke.includes(token), token);
});
test("isolated workflow and collector retain ownership, source/codec/heap/old smoke gates", async () => {
  const workflow = makeAlignment16Workflow(await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"));
  assert.ok(workflow.includes("node media/ffmpeg/build-mpeg2-mvf-arena.mjs"));
  const branch = makeMvfArenaBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"), root);
  const collector = makeMvfArenaCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"), root);
  syntax(branch.generated); syntax(collector.generated);
  const revisedBranch = makeMvfArenaBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"), root, "smoke-warnings");
  const revisedCollector = makeMvfArenaCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"), root, "smoke-warnings");
  syntax(revisedBranch.generated); syntax(revisedCollector.generated);
  assert.ok(revisedBranch.generated.includes("codex/mpeg2-mvf-arena-20261015-smoke-warnings"));
  assert.ok(revisedCollector.generated.includes("assert.equal(process.argv.length, 4)"));
  assert.ok(branch.generated.includes("codex/mpeg2-mvf-arena-20261015"));
  assert.ok(branch.generated.includes("assert.equal(await git([\"status\", \"--porcelain\"]), \"\""));
  for (const token of ["names.length <= 20", "16 * 1024 ** 2", "reverseSingleIdleRefstruct(reverseMvfArenaRefstruct(actualRefstruct))",
    "ebmlCandidateSmoke.injectedFailureCases, 4", "mvf.actualHevcSha256, mvfSourceProof.candidateHevcSha256", "mvfSmoke.initErrorFlagCases, 4"])
    assert.ok(collector.generated.includes(token), token);
});
