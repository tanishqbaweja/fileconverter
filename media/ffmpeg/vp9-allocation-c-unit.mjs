// Host C allocator controls with fake memory; never a codec or real heap sample.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createHash } from "node:crypto";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makeVp9FrameAllocationDiagnostic } from "./vp9-allocation-diagnostic-recipe.mjs";
export function makeVp9AllocationCUnitSource(base) {
  const recipe = makeVp9FrameAllocationDiagnostic(base);
  const extract = (source, name) => source.slice(source.indexOf("int vpx_realloc_frame_buffer("), source.indexOf("int vpx_alloc_frame_buffer("))
    .replace("int vpx_realloc_frame_buffer(", "static int " + name + "(");
  return [
    '#include <assert.h>',
    '#include <stdint.h>',
    '#include <stddef.h>',
    '#include <stdio.h>',
    '#include <string.h>',
    '#define YV12_FLAG_HIGHBITDEPTH 8',
    '#define CONVERT_TO_BYTEPTR(x) (x)',
    'typedef struct {',
    ' uint8_t *buffer_alloc, *y_buffer, *u_buffer, *v_buffer;',
    ' size_t buffer_alloc_sz, frame_size;',
    ' int y_crop_width,y_crop_height,y_width,y_height,y_stride;',
    ' int uv_crop_width,uv_crop_height,uv_width,uv_height,uv_stride;',
    ' int border,subsampling_x,subsampling_y,flags,corrupted;',
    '} YV12_BUFFER_CONFIG;',
    'typedef struct { uint8_t *data; size_t size; } vpx_codec_frame_buffer_t;',
    'typedef int (*vpx_get_frame_buffer_cb_fn_t)(void *,size_t,vpx_codec_frame_buffer_t *);',
    'static uint8_t memory[8388608];',
    'static int fail_allocation, calls, frees, statistics[5];',
    'static size_t requested;',
    'static size_t emscripten_get_heap_size(void) { ++statistics[0]; return 100663296; }',
    'static size_t emscripten_get_heap_max(void) { ++statistics[1]; return 100663296; }',
    'static size_t emmalloc_dynamic_heap_size(void) { ++statistics[2]; return 99614720; }',
    'static size_t emmalloc_free_dynamic_memory(void) { ++statistics[3]; return 2097152; }',
    'static size_t emmalloc_unclaimed_heap_memory(void) { ++statistics[4]; return 131072; }',
    'static void *yv12_align_addr(void *p, int a) { return (void *)(((uintptr_t)p + a - 1) & ~((uintptr_t)a - 1)); }',
    'static void vpx_free(void *p) { assert(!p || p == memory); ++frees; }',
    'static void *vpx_memalign(size_t a, size_t n) { assert(a == 32 && n <= sizeof(memory)); ++calls; requested = n; return fail_allocation ? NULL : memory; }',
    extract(base, "original_allocate"),
    extract(recipe.generated, "candidate_allocate"),
    'static int bad_callback(void *p,size_t n,vpx_codec_frame_buffer_t *fb) { assert(!p && n > 0 && fb); return -1; }',
    'typedef int (*Allocate)(YV12_BUFFER_CONFIG*,int,int,int,int,',
    '#if CONFIG_VP9_HIGHBITDEPTH',
    'int,',
    '#endif',
    'int,int,vpx_codec_frame_buffer_t*,vpx_get_frame_buffer_cb_fn_t,void*);',
    'typedef struct { int result,calls,frees,statistics[5]; size_t requested; YV12_BUFFER_CONFIG frame; } Result;',
    'static Result execute(Allocate fn,int test) {',
    ' Result out; memset(&out,0,sizeof(out)); memset(statistics,0,sizeof(statistics)); calls=frees=0;requested=0;fail_allocation=test==1;',
    ' if(test==2) { out.frame.buffer_alloc=memory;out.frame.buffer_alloc_sz=sizeof(memory); }',
    ' vpx_codec_frame_buffer_t fb={0};',
    ' out.result=fn(test==4 ? NULL : &out.frame,1920,804,1,1,',
    '#if CONFIG_VP9_HIGHBITDEPTH',
    '1,',
    '#endif',
    'test==3 ? 161 : 160,32,test==5 ? &fb : NULL,test==5 ? bad_callback : NULL,NULL);',
    ' out.calls=calls;out.frees=frees;out.requested=requested;memcpy(out.statistics,statistics,sizeof(statistics));return out;',
    '}',
    'int main(void) {',
    ' for(int test=0;test<6;++test) {',
    '  Result a=execute(original_allocate,test),b=execute(candidate_allocate,test);',
    '  assert(a.result==b.result && a.calls==b.calls && a.frees==b.frees && a.requested==b.requested);',
    '  assert(memcmp(&a.frame,&b.frame,sizeof(a.frame))==0);',
    '  for(int i=0;i<5;++i) { assert(a.statistics[i]==0);assert(b.statistics[i]==(test==1)); }',
    '  if(test==1) { assert(a.result==-1 && a.calls==1 && a.requested>0); }',
    ' }',
    ' puts("6 12 1 0");',
    ' return 0;',
    '}',
  ].join("\n") + "\n";
}
export async function runVp9AllocationCUnit(base) {
  const root = path.resolve(import.meta.dirname, "../..");
  base ??= JSON.parse(await readFile(path.join(root, "evidence/2026-11-06-vp9-allocation-source-audit.json"))).sources.frameAllocator.exactSource;
  const source = makeVp9AllocationCUnitSource(base), runtime = await createOwnedRuntimeScratch("vp9-allocation-c-unit-"), execute = promisify(execFile);
  const options = { cwd: root, env: runtime.env, windowsHide: true, timeout: 30000, maxBuffer: 262144 }, compiler = process.env.WITHIN_HOST_CC ?? (process.platform === "linux" ? "/usr/bin/cc" : "cc");
  try {
    const compilerVersion = (await execute(compiler, ["--version"], options)).stdout.split(/\r?\n/)[0].slice(0,512), variants = [];
    const file = path.join(runtime.directory, "unit.c"); await writeFile(file, source, { flag: "wx" });
    for (const highBitDepth of [0,1]) {
      const binary = path.join(runtime.directory, "unit-" + highBitDepth + (process.platform === "win32" ? ".exe" : ""));
      await execute(compiler, ["-std=c11","-O0","-Wall","-Wextra","-Werror","-DCONFIG_VP9_HIGHBITDEPTH=" + highBitDepth,file,"-o",binary], options);
      const result = await execute(binary, [], options);
      assert.equal(result.stdout.trim(), "6 12 1 0");
      assert.equal(result.stderr.trim().split(/\r?\n/).length, 1); assert.match(result.stderr, /\[within-vp9-alloc\] w=1920 h=804 b=160 a=32 frame=\d+ heap=100663296 max=100663296 managed=99614720 free=2097152 unclaimed=131072/);
      variants.push({ highBitDepth, cases: 6, functionCalls: 12, failureReports: 1, successfulPathStatisticCalls: 0, simulatedFailureLine: result.stderr.trim() });
    }
    return { scope: "Host-compiled exact allocator controls with mocked allocation/statistic APIs, NOT real heap or media measurements", compilerVersion,
      sourceSha256: createHash("sha256").update(source).digest("hex"), totalFunctionCalls: 24, variants,
      nativeCodecConversion: false, actualBrowserHeapMeasurements: null, publicAcceptance: false };
  } finally { await runtime.close(); }
}
