// Native synthetic dispatch and source-reversal controls; not browser acceptance.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeReallocAttemptRecipe } from "../media/ffmpeg/mpeg2-realloc-attempt-recipe.mjs";
import { makeLargestIdleRecipe } from "../media/ffmpeg/mpeg2-packet-largest-idle-recipe.mjs";
import { makeReallocHostedBuilder, makeAlignment16Builder, makePacketCacheOuterBuilder, makePacketCacheHevcWrapper } from "../media/ffmpeg/mpeg2-realloc-builder-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function reverse(recipe) { let text = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) text = text.replace(after, before); return text; }
function syntax(text) { const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: text, encoding: "utf8", windowsHide: true, timeout: 5000 }); assert.equal(result.status, 0, result.stderr); }
test("new scalar shell reverses to all actually qualified fixed-heap/SDK/encoder/cache/codec/AVIO gates", async () => {
  const source = await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"), recipe = makeReallocAttemptRecipe(source);
  assert.equal(reverse(recipe), makeLargestIdleRecipe(source)); assert.equal(recipe.diagnosticBytes, 64);
  for (const token of ["mpeg2-realloc-attempt.c", "mpeg2-realloc-avutil-smoke.c", "--wrap=av_buffer_realloc", "--wrap=av_realloc",
    "-sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432", "-sALLOW_MEMORY_GROWTH=0", "-sASYNCIFY_STACK_SIZE=262144", "build-mpeg2-split-encoder.sh",
    "packet-first-idle-smoke", "packet-cache-smoke", "-Wall -Wextra -Werror"])
    assert.ok(recipe.generated.includes(token), token);
  assert.equal(recipe.publicAcceptance, false); assert.equal(recipe.failedOriginalRequestProven, false);
  assert.equal(recipe.generated.split('"${SCRIPT_DIR}/mpeg2-realloc-attempt.c"').length - 1, 2, "Actual library smoke and production decoder are both linked");
});
test("all nested builder routes select new diagnostic, retain prior gates and parse, with no claimed browser success", async () => {
  const source = await read("media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"), recipe = makeReallocHostedBuilder(source, root);
  assert.equal(reverse(recipe), source); syntax(recipe.generated);
  const raw = await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs"); syntax(makeAlignment16Builder(raw, root).generated);
  const outer = makePacketCacheOuterBuilder(await read("media/ffmpeg/build-mpeg2-alignment16.mjs"), root); syntax(outer.generated);
  const hevc = makePacketCacheHevcWrapper(await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs"), root); syntax(hevc.generated);
  assert.ok(outer.generated.includes("mpeg2-realloc-builder-recipe.mjs")); assert.ok(hevc.generated.includes("mpeg2-realloc-builder-recipe.mjs"));
  for (const token of ["actual.constructorBindingVerified, true", "actual.aliasContentPreserved, true", "dispatch.passed, 9", "actual.passed, 6",
    "heapLimitsChanged: false", "bufferReferenceOwnershipChanged: false", "browserFailurePathQualified: false", "publicAcceptance: false",
    "await unlink(dispatchPath); await unlink(actualPath);", "windowsHide: true", "runtime.close()"])
    assert.ok(recipe.generated.includes(token), token);
});
test("compile and execute real C diagnostic under synthetic host dispatch; nine cases with finally-owned cleanup", async () => {
  const runtime = await createOwnedRuntimeScratch("native-realloc-control-");
  try {
    const compiler = "H:/LLVM-MinGW/llvm-mingw-20260616-ucrt-x86_64/bin/clang.exe";
    const executable = path.join(runtime.directory, "realloc-control.exe");
    const built = spawnSync(compiler, ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "-UNDEBUG", "-static",
      path.join(root, "media/ffmpeg/mpeg2-realloc-attempt-smoke.c"), "-o", executable],
      { cwd: root, env: runtime.env, windowsHide: true, encoding: "utf8", timeout: 30000 });
    assert.equal(built.error, undefined); assert.equal(built.status, 0, built.stderr);
    const result = spawnSync(executable, [], { cwd: root, env: runtime.env, windowsHide: true, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 0, result.stderr); const report = JSON.parse(result.stdout);
    assert.equal(report.scope, "synthetic-realloc-dispatch-not-real-libavutil-or-media-oom");
    assert.equal(report.cases, 9); assert.equal(report.passed, 9); assert.equal(report.slotBytes, 64); assert.equal(report.conversionsPerformed, 0);
    assert.deepEqual(report.pendingPhases, [1,2]);
  } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
});
test("diagnostic observes scalar public buffer fields and delegates exact allocation calls with no retention", async () => {
  const source = await read("media/ffmpeg/mpeg2-realloc-attempt.c");
  for (const token of ["within_realloc_attempt_words[16]", "sizeof(within_realloc_attempt_words) == 64", "WITHIN_REALLOC_REAL_BUFFER(buffer, bytes)",
    "WITHIN_REALLOC_REAL_CALL(pointer, bytes)", "withinReallocAttemptAddress", "withinReallocAttemptWords", "sequence == UINT32_MAX", "sizeof(size_t) == 4"])
    assert.ok(source.includes(token), token);
  for (const forbidden of ["memcpy(", "memset(", "printf(", "av_buffer_ref(", "malloc(", "calloc(", "free("])
    assert.ok(!source.includes(forbidden), forbidden);
});
