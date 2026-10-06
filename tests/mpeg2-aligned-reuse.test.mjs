import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { makeAlignedReuseRecipe } from "../media/ffmpeg/mpeg2-aligned-reuse-recipe.mjs";
import { provenSourceSha } from "./helpers/nondocker-workflow-provenance.mjs";
const read = file => readFile(new URL(`../${file}`, import.meta.url), "utf8");
test("Private recipe adds only wrapper/link interception and source-directory binding, all existing codec/heap flags unchanged", async () => {
  const original = await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"), generated = makeAlignedReuseRecipe(original);
  let reverted = generated.replace('SCRIPT_DIR="${WITHIN_ALIGNED_REUSE_SCRIPT_DIR:?}"', 'SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"')
    .replace(' "${SCRIPT_DIR}/mpeg2-aligned-reuse.c"', "").replace("-Wl,--wrap=posix_memalign ", "");
  assert.equal(reverted, original);
  assert.throws(() => makeAlignedReuseRecipe(original + "\n"), /Frozen baseline/);
  for (const required of ["-sINITIAL_MEMORY=33554432", "-sMAXIMUM_MEMORY=33554432", "-sALLOW_MEMORY_GROWTH=0",
    "-sSTACK_SIZE=262144", "-sASYNCIFY_STACK_SIZE=262144", "--enable-decoder=h264,hevc,mpeg4,mpeg2video,theora,vp8,vp9"])
    assert.ok(generated.includes(required), required);
});
test("Allocator wrapper preserves upstream admission/initialization and never frees a codec-owned reference", async () => {
  const source = await read("media/ffmpeg/mpeg2-aligned-reuse.c"), smoke = await read("media/ffmpeg/mpeg2-aligned-reuse-smoke.c");
  assert.match(source, /alignment == 16 && bytes >= 262144/);
  assert.match(source, /\(\(uintptr_t\)candidate & 15\) == 0/);
  assert.match(source, /free\(candidate\)/); assert.match(source, /return __real_posix_memalign\(pointer, alignment, bytes\)/);
  assert.doesNotMatch(source, /av_frame|av_buffer_unref|malloc_trim\(|memcpy\(|realloc\(/);
  for (const needle of ["next_malloc = arena + 8", "next_malloc = NULL", "upstream_error = ENOMEM", "upstream_bytes == 128"])
    assert.ok(smoke.includes(needle), needle);
});
test("Candidate build requires actual wrapper, byte-exact original encoder, synthetic contract and explicit non-acceptance", async () => {
  const script = await read("media/ffmpeg/build-mpeg2-aligned-reuse.mjs"), workflow = await read(".github/workflows/reproduce-ffmpeg-nondocker.yml");
  assert.ok(script.includes('includes("__wrap_posix_memalign")')); assert.ok(script.includes('assert.equal(smoke.passed, 6)'));
  assert.ok(script.includes('freesOnlyFreshUnexposedPointer: true')); assert.ok(script.includes('browserConversionVerified: false'));
  assert.ok(script.includes('Promise.allSettled([runtime.close()')); assert.ok(workflow.includes('retention-days: 1'));
  assert.ok(workflow.includes('cancel-in-progress: false')); assert.ok(workflow.includes('if: always()'));
  assert.ok(workflow.includes('test "$task_path" = "$GITHUB_WORKSPACE/work/mpeg2-split-pipeline-output" && ! test -L "$task_path"'));
});

test("Aligned candidate workflow additions reverse exactly, incomplete or mutated additions fail historical provenance", async () => {
  const file = ".github/workflows/reproduce-ffmpeg-nondocker.yml", source = await read(file);
  const expected = "5a0d4a2a4357abae5715363367aef69c400e584b49836c645eae0e08d5c587c6";
  assert.equal(provenSourceSha(file, Buffer.from(source), expected), expected);
  for (const needle of ["          - within-mpeg2-aligned-reuse\n",
    "            node media/ffmpeg/build-mpeg2-aligned-reuse.mjs\n",
    "          name: private-mpeg2-aligned-reuse-${{ github.run_id }}\n",
    " && inputs.core != 'within-mpeg2-aligned-reuse'"])
    assert.throws(() => provenSourceSha(file, Buffer.from(source.replace(needle, "")), expected), /Exactly one complete/);
});
