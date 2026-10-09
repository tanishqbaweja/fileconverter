import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeExecutedLateRefstructFromUpstream, applySingleIdleRefstruct, reverseSingleIdleRefstruct, SINGLE_IDLE_EDITS,
  EXECUTED_LATE_REFSTRUCT_SHA256 } from "../media/ffmpeg/mpeg2-single-idle-source.mjs";
import { makeSingleIdleRecipe } from "../media/ffmpeg/mpeg2-single-idle-recipe.mjs";
import { makeLateRefstructRecipe } from "../media/ffmpeg/mpeg2-late-refstruct-recipe.mjs";
import { makeSingleIdleBuildWorkflow } from "../scripts/lib/single-idle-build-workflow.mjs";
const read = file => readFile(new URL("../" + file, import.meta.url));
const proof = JSON.parse(await read("evidence/mpeg2-single-idle-source-2026-10-10.json"));
const compressed = await read(proof.sourceArchive.path); assert.equal(sha(compressed), proof.sourceArchive.sha256);
const bytes = gunzipSync(compressed, { maxOutputLength: 131072 }); assert.equal(sha(bytes), proof.sourceArchive.restoredSha256);
const native = JSON.parse(bytes);

test("Exact old executed source and additive two-edit single-idle policy reverse byte-exact; no lifetime/size/codec changes", () => {
  assert.equal(makeExecutedLateRefstructFromUpstream(native.upstream), native.executedLate);
  assert.equal(sha(native.executedLate), EXECUTED_LATE_REFSTRUCT_SHA256);
  assert.equal(applySingleIdleRefstruct(native.executedLate), native.singleIdle);
  assert.equal(reverseSingleIdleRefstruct(native.singleIdle), native.executedLate);
  assert.equal(sha(native.singleIdle), proof.patchedSourceSha256); assert.equal(SINGLE_IDLE_EDITS.length, 2);
  const at = native.singleIdle.indexOf("static void pool_return_entry");
  const end = native.singleIdle.indexOf("static void pool_reset_entry", at);
  const fn = native.singleIdle.slice(at, end);
  assert.match(fn, /ff_mutex_lock\(&pool->mutex\);\s+if \(!pool->uninited && !\(pool->pool_flags & WITHIN_MPEG2_POOL_UNCACHED\) &&\s+\(!\(pool->pool_flags & WITHIN_HEVC_POOL_SINGLE_IDLE\) \|\| !pool->available_entries\)\)/);
  assert.match(fn, /ff_mutex_unlock\(&pool->mutex\);\s+if \(ref\)\s+pool_free_entry\(pool, ref\);/);
  assert.throws(() => applySingleIdleRefstruct(native.executedLate + "\n"));
  assert.throws(() => applySingleIdleRefstruct(native.singleIdle));
  assert.throws(() => applySingleIdleRefstruct(native.executedLate, sha(native.executedLate + "\n")));
  assert.throws(() => reverseSingleIdleRefstruct(native.singleIdle.replace("|| !pool->available_entries", "|| pool->available_entries")));
});

test("Bounded selector is HEVC single-thread decoder only; bit29 disjoint, bit30 still uncached priority", async () => {
  const header = (await read("media/ffmpeg/mpeg2-hevc-single-idle-policy.h")).toString();
  assert.match(header, /\(1u << 29\)/); assert.match(header, /codec_id == AV_CODEC_ID_HEVC && thread_count == 1 && !is_encoder/);
  assert.doesNotMatch(header, /av_free|av_refstruct_unref|memset|skip_frame|qmin|qmax|dpb_flags\s*=/);
  assert.equal(proof.maximumIdleEntriesPerSelectedPool, 1); assert.equal(proof.uncachedBitStillTakesPrecedence, true);
  assert.deepEqual(proof.selectedPools, ["tab_mvf", "rpl_tab"]); assert.equal(proof.publicAcceptance, false);
});

test("Reversible new build keeps exact frozen core/32+16MiB/quality/encoder/AVIO and compiles actual lifetime unit", async () => {
  const base = (await read("media/ffmpeg/build-mpeg2-split-pipeline.sh")).toString(), prior = makeLateRefstructRecipe(base);
  const recipe = makeSingleIdleRecipe(base); assert.equal(recipe, native.generatedRecipe); assert.equal(sha(recipe), proof.generatedRecipeSha256);
  for (const token of ['-sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432',
    '-sSTACK_SIZE=262144 -sSTACK_OVERFLOW_CHECK=2', '-sASYNCIFY_STACK_SIZE=262144',
    'bash "${SCRIPT_DIR}/build-mpeg2-split-encoder.sh"', '"${SCRIPT_DIR}/mpeg2-aligned-reuse.c"',
    'node "${BUILD_ROOT}/late-refstruct-smoke.js"', 'node "${BUILD_ROOT}/single-idle-smoke.js"', '-UNDEBUG']) assert.ok(recipe.includes(token), token);
  assert.ok(prior.includes('cp "${SCRIPT_DIR}/mpeg2-hevc-auxiliary-policy.h"'));
  assert.ok(!recipe.includes('cp "${SCRIPT_DIR}/mpeg2-hevc-auxiliary-policy.h"'));
  assert.ok(recipe.includes('cp "${SCRIPT_DIR}/mpeg2-hevc-single-idle-policy.h"'));
  const smoke = (await read("media/ffmpeg/mpeg2-single-idle-smoke.c")).toString();
  for (const token of ['av_refstruct_ref(a)', 'delayed.pool_freed == 0', 'AV_REFSTRUCT_POOL_FLAG_ZERO_EVERY_TIME',
    'AV_REFSTRUCT_POOL_FLAG_RESET_ON_INIT_ERROR', 'lifecycle(SINGLE_IDLE | UNCACHED)', '200000', 'before + 1']) assert.ok(smoke.includes(token), token);
  assert.doesNotMatch(smoke, /avcodec_open|avformat_open|test\.mkv|avio_/);
  assert.throws(() => makeSingleIdleRecipe(base + "\n"));
  let bash = "bash";
  if (process.platform === "win32") {
    const git = spawnSync("git", ["--exec-path"], { encoding: "utf8", windowsHide: true });
    assert.equal(git.status, 0, git.error?.message);
    bash = path.resolve(git.stdout.trim(), "../../..", "bin/bash.exe");
  }
  const syntax = spawnSync(bash, ["-n"],
    { input: recipe, encoding: "utf8", windowsHide: true });
  assert.equal(syntax.status, 0, syntax.stderr);
});

test("Source proof stays non-acceptance until real compiled/browsed results; new hosted workflow needs no Docker", async () => {
  for (const [file, expected] of Object.entries(proof.sourcePins)) assert.equal(sha(await read(file)), expected, file);
  for (const field of ["compilerExecuted", "publicAcceptance", "speedImprovementProven", "liveReferencesChanged", "pixelsOrCodecOptionsChanged", "heapLimitsRaised"])
    assert.equal(proof[field], false);
  const workflow = (await read(".github/workflows/mpeg2-single-idle-nondocker.yml")).toString();
  assert.ok(workflow.includes("emsdk install 6.0.4") && workflow.includes("build-mpeg2-single-idle.mjs"));
  assert.doesNotMatch(workflow, /docker run|setup-docker|container:/);
  const builder = (await read("media/ffmpeg/build-mpeg2-single-idle.mjs")).toString();
  assert.ok(builder.includes("windowsHide: true") && builder.includes('assert.equal(smoke.sequentialFreshAllocations, 1)'));
  assert.ok(builder.includes('assert.equal(smoke.maximumIdleEntriesPerSelectedPool, 1)'));
});

test("Registered workflow isolated derivative changes only existing private builder, not main/canonical workflow or permissions", async () => {
  const canonical = (await read(".github/workflows/reproduce-ffmpeg-nondocker.yml")).toString();
  const generated = makeSingleIdleBuildWorkflow(canonical);
  assert.equal(generated.replace("node media/ffmpeg/build-mpeg2-single-idle.mjs", "node media/ffmpeg/build-mpeg2-aligned-reuse.mjs"), canonical);
  assert.throws(() => makeSingleIdleBuildWorkflow(canonical + "\n"));
  const preparer = (await read("scripts/prepare-single-idle-build-branch.mjs")).toString();
  assert.ok(preparer.includes("GIT_INDEX_FILE") && preparer.includes("windowsHide: true"));
  assert.ok(preparer.includes('assert.equal(await git(["ls-files", "--", "test.mkv"]), ""'));
  assert.ok(preparer.includes('assert.equal(await git(["ls-remote", "origin", "refs/heads/main"]), main)'));
});

test("Tool collector rejects invalid job IDs before network/storage; requires actual build/manifest/lifetimes and owned cleanup", async () => {
  const collector = (await read("scripts/collect-mpeg2-single-idle-build.mjs")).toString();
  for (const token of ['assert.equal(run.status, "completed")', 'assert.equal(run.conclusion, "success")',
    'assert.equal(run.headSha, branch.commit)', 'assert.equal(smoke.sequentialFreshAllocations, 1)',
    'assert.equal(smoke.maximumIdleEntriesPerSelectedPool, 1)', 'constants.COPYFILE_EXCL',
    'current.ino, identity.ino', 'await runtime.close()', 'windowsHide: true',
    'assert.equal(hash, branch.workflow.generatedSha256)', 'reverseSingleIdleRefstruct(actualRefstruct)']) assert.ok(collector.includes(token), token);
  for (const invalid of ["../test.mkv", "not-a-job"]) {
    const result = spawnSync(process.execPath, ["scripts/collect-mpeg2-single-idle-build.mjs", invalid],
      { cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8", windowsHide: true });
    assert.notEqual(result.status, 0); assert.match(result.stderr, /AssertionError/);
    assert.doesNotMatch(result.stderr, /ENOENT|HTTP|gh\.exe/);
  }
});
