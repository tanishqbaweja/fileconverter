import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { makePacketInterleaveRecipe } from "../media/ffmpeg/mpeg2-packet-interleave-recipe.mjs";
import { makePacketInterleaveHostedBuilder, makeAlignment16Builder, makePacketCacheOuterBuilder,
  makePacketCacheHevcWrapper, INTERLEAVE_FILES } from "../media/ffmpeg/mpeg2-packet-interleave-builder-recipe.mjs";
import { makeAlignment16Workflow, makePacketInterleaveBranchCaller, makePacketInterleaveCollector } from "../scripts/lib/packet-interleave-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], {
    input: source, encoding: "utf8", windowsHide: true, timeout: 5000,
  });
  assert.equal(result.status, 0, result.stderr);
}
test("real interleaver smoke is additive to every inherited native gate and fixed heap", async () => {
  const recipe = makePacketInterleaveRecipe(await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"));
  assert.equal(recipe.productionKernelChanged, false);
  assert.equal(recipe.generated.replace(recipe.generated.slice(recipe.generated.indexOf("# Actual pinned libavformat queue"),
    recipe.generated.indexOf("# Compile the preserved production AVIO/kernel")), ""), recipe.parent);
  for (const token of ["libavformat.a", "libavcodec.a", "libavutil.a", "-Werror", "-UNDEBUG", "-sALLOW_MEMORY_GROWTH=0",
    "-sINITIAL_MEMORY=33554432", "mvf-arena-smoke.c", "realloc-avutil-smoke", "packet-first-idle-smoke"])
    assert.ok(recipe.generated.includes(token), token);
});
test("nested builders keep prior production source gates and add the ownership result", async () => {
  const inner = makeAlignment16Builder(await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), root);
  const outer = makePacketCacheOuterBuilder(await read("media/ffmpeg/build-mpeg2-alignment16.mjs"), root);
  const hevc = makePacketCacheHevcWrapper(await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs"), root);
  const hosted = makePacketInterleaveHostedBuilder(await read("media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"), root);
  for (const recipe of [inner, outer, hevc, hosted]) syntax(recipe.generated);
  for (const token of ["reverseSingleIdleRefstruct(reverseMvfArenaRefstruct(actualRefstruct))", "makePacketInterleaveShellRecipe"])
    assert.ok(inner.generated.includes(token), token);
  for (const token of ["actual.passed, 6", "dispatch.passed, 10", "mvf.constructorFailureCases, 2", "ownership.queuedPayloadAllocations, 8",
    "await unlink(ownershipPath)", "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576"])
    assert.ok(hosted.generated.includes(token), token);
  for (const file of INTERLEAVE_FILES) { assert.ok(hosted.generated.includes(JSON.stringify(file))); await read(file); }
});
test("isolated branch and collector keep parent bounds, cleanup and source validation", async () => {
  const workflow = makeAlignment16Workflow(await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"));
  assert.ok(workflow.includes("node media/ffmpeg/build-mpeg2-packet-interleave.mjs"));
  const branch = makePacketInterleaveBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"), root);
  const collector = makePacketInterleaveCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"), root);
  syntax(branch.generated); syntax(collector.generated);
  assert.ok(branch.generated.includes("codex/mpeg2-packet-interleave-20261015"));
  for (const token of ["names.length <= 20", "16 * 1024 ** 2", "mvfSmoke.initErrorFlagCases, 4", "experiment.drainedPayloadAllocations, 1",
    "await runtime.close()", "realContainerFidelityVerified", "conversionSpeedGainProven"])
    assert.ok(collector.generated.includes(token), token);
});
test("actual C smoke tests queued ownership, aliases, mux-held refs, errors, abandonment and repeat use", async () => {
  const source = await read("media/ffmpeg/mpeg2-packet-interleave-smoke.c");
  for (const token of ['#include <libavformat/mux.h>', '#include "mpeg2-packet-largest-idle.h"', "av_interleaved_write_frame(context, NULL)",
    "av_packet_ref(sink->held, packet)", "queued == 8 && drained == 1", "AVERROR(EIO)", "i < 2000",
    "owned_allocations == owned_frees", "context->max_interleave_delta = AV_TIME_BASE"])
    assert.ok(source.includes(token), token);
  assert.ok(!source.includes("av_write_frame("));
  assert.doesNotMatch(source, /cache->live\s*=(?!=)/);
});
