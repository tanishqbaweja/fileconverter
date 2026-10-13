import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { makeLargestIdleHeader, makeLargestIdleBridge, makePacketCacheKernel } from "../media/ffmpeg/mpeg2-packet-largest-idle-source.mjs";
import { makePacketCacheBridge, makePacketCacheKernel as priorKernel } from "../media/ffmpeg/mpeg2-packet-cache-source.mjs";
import { makeLargestIdleRecipe } from "../media/ffmpeg/mpeg2-packet-largest-idle-recipe.mjs";
import { makeAlignment16Builder, makePacketCacheOuterBuilder, makePacketCachePipelineGenerator, makePacketCacheHevcWrapper } from "../media/ffmpeg/mpeg2-packet-largest-idle-builder-recipe.mjs";
import { makeLargestIdleWorkflow, makeLargestIdleBranchCaller, makeLargestIdleCollector } from "../scripts/lib/mpeg2-packet-largest-idle-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
test("only final-unref idle selection changes; exact allocation/padding/zero/refcount/close and mux settings preserved", async () => {
  const prior = await read("media/ffmpeg/mpeg2-packet-cache.h"), candidate = await read("media/ffmpeg/mpeg2-packet-largest-idle.h");
  assert.equal(makeLargestIdleHeader(prior), candidate);
  for (const gate of ["bytes > 1048576 || padding != 64", "av_malloc(required)", "memset(lease->data, 0, lease->capacity)", "cache->live--", "if (!ref) within_packet_release", "cache->closed && !cache->live", "lease->capacity > cache->idle->capacity"])
    assert.ok(candidate.includes(gate), gate);
  assert.ok(!candidate.includes("realloc")); assert.ok(!candidate.includes("av_malloc(1048576"));
  const bridge = await read("media/ffmpeg/mpeg2-split-mux-bridge.h");
  assert.equal(makeLargestIdleBridge(bridge).replace('"mpeg2-packet-largest-idle.h"', '"mpeg2-packet-cache.h"'), makePacketCacheBridge(bridge));
  const kernel = await read("media/ffmpeg/mpeg2-candidate.c"); assert.equal(makePacketCacheKernel(kernel), priorKernel(kernel));
  assert.throws(() => makeLargestIdleHeader(prior + prior));
});
test("matched actual-libavutil controls compile under same fixed32MiB, warnings and padding; no media converter", async () => {
  const source = await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"), generated = makeLargestIdleRecipe(source);
  const bash = process.platform === "win32" ? "D:/Program Files/Git/bin/bash.exe" : "bash";
  const result = spawnSync(bash, ["--noprofile", "--norc", "-n"], { input: generated, encoding: "utf8", windowsHide: true, timeout: 15000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(generated.split("mpeg2-packet-largest-idle-smoke.c").length, 3);
  assert.equal(generated.split("-DWITHIN_LARGEST_IDLE").length, 2);
  assert.ok(generated.includes('"${PREFIX}/lib/libavutil.a"')); assert.ok(generated.includes("-sALLOW_MEMORY_GROWTH=0"));
  assert.ok(generated.includes("-sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432"));
  assert.ok(generated.includes("make-mpeg2-packet-largest-idle-pipeline.mjs"));
  const smoke = await read("media/ffmpeg/mpeg2-packet-largest-idle-smoke.c");
  for (const gate of ["i < 200000", "rounds = 2000", "cache->live == 2", "alias->data[j] == 0x63", "workload_calls == rounds + 1", "workload_calls == 2 * rounds + 1", "i <= 3", "fail_create = 1", "balanced()"])
    assert.ok(smoke.includes(gate), gate);
});
test("nested native/workflow/branch/collector derivatives parse; old caps, ownership and canonical worktree gates retained", async () => {
  const recipes = [makeAlignment16Builder(await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), root),
    makePacketCacheOuterBuilder(await read("media/ffmpeg/build-mpeg2-alignment16.mjs"), root),
    makePacketCachePipelineGenerator(await read("media/ffmpeg/make-mpeg2-split-pipeline.mjs"), root),
    makePacketCacheHevcWrapper(await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs"), root),
    makeLargestIdleBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"), root),
    makeLargestIdleCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"), root)];
  for (const recipe of recipes) {
    const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: recipe.generated, encoding: "utf8", windowsHide: true, timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
  }
  for (const gate of ["names.length <= 20", "8 * 1024 ** 2", "16 * 1024 ** 2", "COPYFILE_EXCL", "current.dev, identity.dev", "assert.equal(run.headSha, branch.commit)", "payloadAllocatedBytesAfter, 506088", "conversionSpeedGainProven"])
    assert.ok(recipes[5].generated.includes(gate), gate);
  assert.ok(recipes[4].generated.includes("codex/mpeg2-packet-largest-idle-20261013"));
  const workflow = makeLargestIdleWorkflow(await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"));
  assert.ok(workflow.includes("node media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"));
  for (const gate of ["if: always()", "retention-days: 1", "6.0.4"]) assert.ok(workflow.includes(gate), gate);
});
