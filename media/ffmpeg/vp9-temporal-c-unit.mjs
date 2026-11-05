// Compile ONLY allocator-control stubs, never a media codec or a converter.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makeVp9RealtimeTemporalFilterFunction } from "./vp9-realtime-temporal-filter-recipe.mjs";
const sha = value => createHash("sha256").update(value).digest("hex");
export function makeVp9TemporalCUnitSource(allocation) {
  const candidate = makeVp9RealtimeTemporalFilterFunction(allocation);
  const before = allocation.replace("static void alloc_raw_frame_buffers", "static void original_alloc_raw_frame_buffers");
  const after = candidate.generated.replace("static void alloc_raw_frame_buffers", "static void candidate_alloc_raw_frame_buffers");
  return String.raw`#include <assert.h>
#include <setjmp.h>
#include <stdio.h>
#include <string.h>
#define REALTIME 1
#define VPX_CODEC_MEM_ERROR 7
#define VP9_ENC_BORDER_IN_PIXELS 160
typedef struct { int allocated; } Frame;
typedef struct { int subsampling_x, subsampling_y, use_highbitdepth, byte_alignment, error; } VP9_COMMON;
typedef struct { int width, height, mode, lag_in_frames; } VP9EncoderConfig;
typedef struct { VP9_COMMON common; VP9EncoderConfig oxcf; void *lookahead; Frame tf_buffer; } VP9_COMP;
typedef struct { int lookups, allocations, error, allocated, has_lookahead; } Result;
static VP9_COMP state;
static jmp_buf failure;
static int lookups, allocations, fail_lookahead, fail_temporal;
static int sentinel;
static void vpx_internal_error(int *error, int code, const char *message) {
  assert(code == VPX_CODEC_MEM_ERROR);
  assert(strcmp(message, "Failed to allocate lag buffers") == 0 || strcmp(message, "Failed to allocate temporal filter buffer") == 0);
  *error = code; longjmp(failure, 1);
}
static void *vp9_lookahead_init(int width, int height, int sx, int sy,
#if CONFIG_VP9_HIGHBITDEPTH
 int high,
#endif
 int lag) {
  assert(width == 1920 && height == 804 && sx == 1 && sy == 1 && lag == state.oxcf.lag_in_frames);
#if CONFIG_VP9_HIGHBITDEPTH
  assert(high == 1);
#endif
  ++lookups; return fail_lookahead ? NULL : &sentinel;
}
static int vpx_realloc_frame_buffer(Frame *buffer, int width, int height, int sx, int sy,
#if CONFIG_VP9_HIGHBITDEPTH
 int high,
#endif
 int border, int alignment, void *a, void *b, void *c) {
  assert(buffer == &state.tf_buffer && width == 1920 && height == 804 && sx == 1 && sy == 1);
#if CONFIG_VP9_HIGHBITDEPTH
  assert(high == 1);
#endif
  assert(border == 160 && alignment == 32 && !a && !b && !c);
  ++allocations; if (fail_temporal) return -1; buffer->allocated = 1; return 0;
}
${before}
${after}
static Result execute(void (*fn)(VP9_COMP *), int mode, int lag, int existing, int fail_lag, int fail_tf) {
  memset(&state, 0, sizeof(state)); state.oxcf.width = 1920; state.oxcf.height = 804;
  state.oxcf.mode = mode; state.oxcf.lag_in_frames = lag;
  state.common.subsampling_x = 1; state.common.subsampling_y = 1; state.common.use_highbitdepth = 1; state.common.byte_alignment = 32;
  state.lookahead = existing ? &sentinel : NULL; lookups = allocations = 0;
  fail_lookahead = fail_lag; fail_temporal = fail_tf;
  if (!setjmp(failure)) fn(&state);
  Result r = { lookups, allocations, state.common.error, state.tf_buffer.allocated, state.lookahead != NULL }; return r;
}
static void same(Result a, Result b) {
  assert(a.lookups == b.lookups && a.allocations == b.allocations && a.error == b.error && a.allocated == b.allocated && a.has_lookahead == b.has_lookahead);
}
int main(void) {
  int pairs = 0, avoided = 0, errors_avoided = 0;
  const int lags[] = {0, 1, 25};
  for (int mode = 0; mode <= 1; ++mode) for (int n = 0; n < 3; ++n)
    for (int existing = 0; existing <= 1; ++existing) for (int fail_lag = 0; fail_lag <= 1; ++fail_lag)
      for (int fail_tf = 0; fail_tf <= 1; ++fail_tf) {
        Result a = execute(original_alloc_raw_frame_buffers, mode, lags[n], existing, fail_lag, fail_tf);
        Result b = execute(candidate_alloc_raw_frame_buffers, mode, lags[n], existing, fail_lag, fail_tf); ++pairs;
        if (mode == REALTIME && lags[n] == 0 && (existing || !fail_lag)) {
          assert(a.allocations == 1 && b.allocations == 0 && b.error == 0 && !b.allocated);
          assert(a.lookups == b.lookups && a.has_lookahead == b.has_lookahead); ++avoided;
          if (fail_tf) { assert(a.error == VPX_CODEC_MEM_ERROR); ++errors_avoided; }
        } else same(a, b);
      }
  /* A later GOOD frame still allocates; a subsequent REALTIME frame does not free or reuse an invalid pointer. */
  Result rt = execute(candidate_alloc_raw_frame_buffers, REALTIME, 0, 0, 0, 0);
  assert(rt.allocations == 0 && rt.has_lookahead && !rt.allocated);
  state.oxcf.mode = 0; candidate_alloc_raw_frame_buffers(&state);
  assert(allocations == 1 && state.tf_buffer.allocated);
  state.oxcf.mode = REALTIME; candidate_alloc_raw_frame_buffers(&state);
  assert(allocations == 1 && state.tf_buffer.allocated);
  assert(pairs == 48 && avoided == 6 && errors_avoided == 3);
  printf("{\"pairs\":48,\"functionCalls\":99,\"modeTransitionCalls\":3,\"allocationsAvoided\":6,\"injectedTemporalErrorsAvoided\":3}\n");
  return 0;
}
`;
}
export async function runVp9TemporalCUnit(allocation) {
  const root = path.resolve(import.meta.dirname, "../..");
  allocation ??= JSON.parse(await readFile(path.join(root, "evidence/2026-11-06-vp9-temporal-filter-source-audit.json"))).allocation.exactSource;
  const source = makeVp9TemporalCUnitSource(allocation), execute = promisify(execFile), runtime = await createOwnedRuntimeScratch("vp9-temporal-c-unit-");
  const compiler = process.env.WITHIN_HOST_CC ?? (process.platform === "linux" ? "/usr/bin/cc" : "cc");
  const options = { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 262144 };
  try {
    const version = (await execute(compiler, ["--version"], options)).stdout.split(/\r?\n/)[0].slice(0, 512), file = path.join(runtime.directory, "unit.c");
    await writeFile(file, source, { flag: "wx" }); const variants = [];
    for (const highBitDepth of [0, 1]) {
      const binary = path.join(runtime.directory, "unit-" + highBitDepth + (process.platform === "win32" ? ".exe" : ""));
      await execute(compiler, ["-std=c11", "-O0", "-Wall", "-Wextra", "-Werror", "-DCONFIG_VP9_HIGHBITDEPTH=" + highBitDepth, file, "-o", binary], options);
      const result = JSON.parse((await execute(binary, [], options)).stdout); assert.equal(result.pairs, 48); assert.equal(result.functionCalls, 99);
      variants.push({ highBitDepth, ...result });
    }
    return { scope: "Host-compiled exact allocation-function control tests with mocked allocators, NOT codec conversion/fidelity",
      compilerVersion: version, sourceSha256: sha(source), variants, totalFunctionCalls: 198, nativeCodecConversion: false, publicAcceptance: false };
  } finally { await runtime.close(); }
}
