import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { makeDurationDrainKernel } from "../media/ffmpeg/mpeg2-duration-drain-source.mjs";
import { makeDurationDrainHostedBuilder, makeDurationDrainShellRecipe, makeAlignment16Builder, makePacketCacheOuterBuilder,
  makePacketCacheHevcWrapper, makePacketCachePipelineGenerator, DURATION_DRAIN_FILES } from "../media/ffmpeg/mpeg2-duration-drain-builder-recipe.mjs";
import { makeAlignment16Workflow, makeDurationDrainBranchCaller, makeDurationDrainCollector } from "../scripts/lib/duration-drain-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function syntax(source) {
  const result = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
}
test("duration-only correction reverses exactly, retaining source offset, PTS/DTS and queue/error paths", async () => {
  const source = await read("media/ffmpeg/mpeg2-candidate.c"), recipe = makeDurationDrainKernel(source);
  const parentStart = recipe.parent.indexOf("    av_packet_rescale_ts(p->encoded"), parentEnd = recipe.parent.indexOf("    // Encoder timestamps", parentStart);
  const changedStart = recipe.generated.indexOf("    int64_t duration;"), changedEnd = recipe.generated.indexOf("    // Encoder timestamps", changedStart);
  const reversed = recipe.generated.slice('#include "mpeg2-duration-boundary.h"\n'.length).replace(
    recipe.generated.slice(changedStart, changedEnd), recipe.parent.slice(parentStart, parentEnd));
  assert.equal(reversed, recipe.parent); assert.equal(recipe.ptsDtsRewritten, false); assert.equal(recipe.encoderPacketWireChanged, false);
  assert.ok(recipe.generated.includes("result = av_interleaved_write_frame(p->output, NULL)"));
  assert.throws(() => makeDurationDrainKernel(source + "\n"));
});
test("native source smoke uses real FFmpeg rounding plus independent integer oracle and invalid-input guards", async () => {
  const header = await read("media/ffmpeg/mpeg2-duration-boundary.h"), smoke = await read("media/ffmpeg/mpeg2-duration-boundary-smoke.c");
  for (const token of ["av_rescale_q(packet->dts + 1", "end - start", "packet->pts != packet->dts", "packet->dts == INT64_MAX"])
    assert.ok(header.includes(token), token);
  assert.doesNotMatch(header, /packet->(?:pts|dts)\s*=(?!=)/); assert.ok(!header.includes("malloc("));
  for (const token of ["126000", "sequences == 21", "rejected == 15", "durations[0] == 666", "total == 64000", "oracle(i + 1", "memcmp(before, &packet"])
    assert.ok(smoke.includes(token), token);
});
test("all generated builders parse and retain parent controls with corrected metadata and fixed heaps", async () => {
  const shell = makeDurationDrainShellRecipe(await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"));
  for (const token of ["mpeg2-duration-boundary-smoke.c", "mpeg2-packet-interleave-smoke.c", "mvf-arena-smoke.c", "-sMAXIMUM_MEMORY=33554432"])
    assert.ok(shell.includes(token), token);
  const recipes = [makeAlignment16Builder(await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), root),
    makePacketCacheOuterBuilder(await read("media/ffmpeg/build-mpeg2-alignment16.mjs"), root),
    makePacketCacheHevcWrapper(await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs"), root),
    makePacketCachePipelineGenerator(await read("media/ffmpeg/make-mpeg2-split-pipeline.mjs"), root),
    makeDurationDrainHostedBuilder(await read("media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"), root)];
  for (const recipe of recipes) syntax(recipe.generated);
  const hosted = recipes.at(-1).generated;
  for (const file of DURATION_DRAIN_FILES) { await read(file); assert.ok(hosted.includes(JSON.stringify(file))); }
  for (const token of ["onlyQueueDrainAdded: false", "duration.invalidCases, 15", "dispatch.passed, 10", "actual.passed, 6", "await unlink(durationPath)"])
    assert.ok(hosted.includes(token), token);
});
test("workflow and collector retain isolation, all20 tools, source limits and new native assertions", async () => {
  assert.ok(makeAlignment16Workflow(await read(".github/workflows/reproduce-ffmpeg-nondocker.yml")).includes("node media/ffmpeg/build-mpeg2-duration-drain.mjs"));
  const branch = makeDurationDrainBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"), root);
  const collector = makeDurationDrainCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"), root);
  syntax(branch.generated); syntax(collector.generated);
  assert.ok(branch.generated.includes("codex/mpeg2-duration-drain-20261015"));
  for (const token of ["names.length <= 20", "16 * 1024 ** 2", "manifest.packetDrain.onlyQueueDrainAdded, false", "duration.iterations, 126000", '"ptsDtsRewritten"'])
    assert.ok(collector.generated.includes(token), token);
});
