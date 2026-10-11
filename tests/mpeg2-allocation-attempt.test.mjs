import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { makeAllocationAttemptRecipe } from "../media/ffmpeg/mpeg2-allocation-attempt-recipe.mjs";
import { makeSingleIdleRecipe } from "../media/ffmpeg/mpeg2-single-idle-recipe.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
const execute = promisify(execFile);
test("actual native C dispatch keeps all six original outcomes and captures both synthetic abort phases without hiding them", async () => {
  const runtime = await createOwnedRuntimeScratch("allocator-attempt-unit-");
  try {
    const program = path.join(runtime.directory, process.platform === "win32" ? "smoke.exe" : "smoke");
    await execute("cc", ["-std=c11", "-O2", "-Wall", "-Wextra", "-Werror", "-UNDEBUG",
      "media/ffmpeg/mpeg2-allocation-attempt-smoke.c", "-o", program],
    { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 65536 });
    const { stdout } = await execute(program, [], { cwd: root, env: runtime.env, windowsHide: true, timeout: 5000, maxBuffer: 4096 });
    assert.deepEqual(JSON.parse(stdout), { scope: "synthetic-allocator-attempt-dispatch-not-media-oom", cases: 9,
      passed: 9, slotBytes: 64, failurePhasesObserved: [1, 4], originalDispatchPreserved: true, conversionsPerformed: 0 });
  } finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
});
test("exact old allocator source is included unmodified; slot is bounded and diagnostics never read media or reference payloads", async () => {
  assert.equal(sha(await read("media/ffmpeg/mpeg2-aligned-reuse.c")), "57c83bb5dfe204cee152381002963a72394789abfa03efc7ac6685a8f3b9f785");
  const source = await read("media/ffmpeg/mpeg2-allocation-attempt.c");
  assert.match(source, /volatile uint32_t within_allocator_attempt_words\[16\]/);
  assert.match(source, /#include "mpeg2-aligned-reuse\.c"/);
  assert.match(source, /FAST_MALLOC_PENDING;\s+void \*result = WITHIN_ATTEMPT_MALLOC\(bytes\)/);
  assert.match(source, /UPSTREAM_PENDING;\s+int result = WITHIN_ATTEMPT_UPSTREAM\(pointer, alignment, bytes\)/);
  assert.doesNotMatch(source, /av_frame|av_buffer|memcpy|realloc|printf|fopen|malloc_trim/);
  assert.match(source, /withinAllocatorAttemptAddress/); assert.match(source, /withinAllocatorAttemptWords"] = 16/);
});
test("recipe reverses exact previous build, leaves fixed memory/codec/encoder/AVIO unchanged and compiles actual Wasm scalar tests", async () => {
  const base = await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"), prior = makeSingleIdleRecipe(base);
  const recipe = makeAllocationAttemptRecipe(base);
  const boundary = "# Compile the preserved production AVIO/kernel with the separate codec hooks.";
  const start = recipe.indexOf("# Synthetic actual-Wasm scalar-slot dispatch");
  const end = recipe.indexOf(boundary, start);
  assert.ok(start >= 0 && end > start);
  const reverted = (recipe.slice(0, start) + recipe.slice(end))
    .replaceAll('"${SCRIPT_DIR}/mpeg2-allocation-attempt.c"', '"${SCRIPT_DIR}/mpeg2-aligned-reuse.c"');
  assert.equal(reverted, prior); assert.throws(() => makeAllocationAttemptRecipe(base + "\n"));
  for (const token of ["-sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432",
    "-sSTACK_SIZE=262144 -sSTACK_OVERFLOW_CHECK=2", "-sASYNCIFY_STACK_SIZE=262144",
    'bash "${SCRIPT_DIR}/build-mpeg2-split-encoder.sh"', 'node "${BUILD_ROOT}/single-idle-smoke.js"',
    'node "${BUILD_ROOT}/allocation-attempt-smoke.js"']) assert.ok(recipe.includes(token), token);
  let bash = "bash";
  if (process.platform === "win32") {
    const git = await execute("git", ["--exec-path"], { windowsHide: true, timeout: 5000 });
    bash = path.resolve(git.stdout.trim(), "../../..", "bin/bash.exe");
  }
  const { spawnSync } = await import("node:child_process");
  const checked = spawnSync(bash, ["-n"], { input: recipe, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
});
