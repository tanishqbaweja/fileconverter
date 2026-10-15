import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { DRAIN_INSERTION, makePacketDrainKernel, makePacketCacheBridge } from "../media/ffmpeg/mpeg2-packet-drain-source.mjs";
import { makePacketCacheBridge as parentBridge } from "../media/ffmpeg/mpeg2-packet-largest-idle-source.mjs";
import { makePacketDrainRecipe } from "../media/ffmpeg/mpeg2-packet-drain-recipe.mjs";
import { makePacketDrainHostedBuilder, makeAlignment16Builder, makePacketCacheOuterBuilder, makePacketCacheHevcWrapper,
  makePacketCachePipelineGenerator, PACKET_DRAIN_EXTRA_FILES } from "../media/ffmpeg/mpeg2-packet-drain-builder-recipe.mjs";
import { makeAlignment16Workflow, makePacketDrainBranchCaller, makePacketDrainCollector } from "../scripts/lib/packet-drain-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
function syntax(source) {
  const checked = spawnSync(process.execPath, ["--check", "--input-type=module"], { input: source, encoding: "utf8", windowsHide: true, timeout: 5000 });
  assert.equal(checked.status, 0, checked.stderr);
}
test("only one queue flush is added after original success/release checks; all other bytes reverse exactly", async () => {
  const source = await read("media/ffmpeg/mpeg2-candidate.c"), recipe = makePacketDrainKernel(source);
  assert.equal(recipe.generated.replace(DRAIN_INSERTION, ""), recipe.parent);
  assert.equal(recipe.changedPackets.replace(DRAIN_INSERTION, ""), recipe.originalPackets);
  assert.equal(recipe.generated.split(DRAIN_INSERTION).length, 2);
  assert.ok(!recipe.generated.includes("av_write_frame("));
  assert.equal(recipe.liveReferencesChanged, false); assert.equal(recipe.codecSettingsChanged, false);
  const bridge = await read("media/ffmpeg/mpeg2-split-mux-bridge.h");
  assert.equal(makePacketCacheBridge(bridge), parentBridge(bridge));
  assert.throws(() => makePacketDrainKernel(source + "\n"));
});
test("drain shell retains native ownership/alias/error tests, heap limits and all parent smokes", async () => {
  const recipe = makePacketDrainRecipe(await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"));
  assert.equal(recipe.generated.replace("make-mpeg2-packet-drain-pipeline.mjs", "make-mpeg2-packet-largest-idle-pipeline.mjs"), recipe.parent);
  for (const token of ["mpeg2-packet-interleave-smoke.c", "mvf-arena-smoke.c", "realloc-avutil-smoke", "packet-first-idle-smoke",
    "-sINITIAL_MEMORY=33554432", "-sMAXIMUM_MEMORY=33554432", "-sALLOW_MEMORY_GROWTH=0"])
    assert.ok(recipe.generated.includes(token), token);
});
test("all nested generators parse and route the real production kernel through the new source helper", async () => {
  const inner = makeAlignment16Builder(await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), root);
  const outer = makePacketCacheOuterBuilder(await read("media/ffmpeg/build-mpeg2-alignment16.mjs"), root);
  const hevc = makePacketCacheHevcWrapper(await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs"), root);
  const pipeline = makePacketCachePipelineGenerator(await read("media/ffmpeg/make-mpeg2-split-pipeline.mjs"), root);
  const hosted = makePacketDrainHostedBuilder(await read("media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"), root);
  for (const recipe of [inner, outer, hevc, pipeline, hosted]) syntax(recipe.generated);
  assert.ok(inner.generated.includes("makePacketDrainShellRecipe"));
  assert.ok(pipeline.generated.includes("mpeg2-packet-drain-source.mjs"));
  assert.match(hosted.generated, /import \{ makePacketCacheBridge, makePacketCacheKernel \} from "file:[^"]+mpeg2-packet-drain-source\.mjs"/);
  for (const token of ["dispatch.passed, 10", "actual.passed, 6", "mvf.constructorFailureCases, 2", "ownership.drainedPayloadAllocations, 1",
    "manifest.packetCache.generatedKernel, drainKernel.generated", "containerPacketOrderMayChange: true"])
    assert.ok(hosted.generated.includes(token), token);
  for (const file of PACKET_DRAIN_EXTRA_FILES) { await read(file); assert.ok(hosted.generated.includes(JSON.stringify(file))); }
});
test("isolated workflow and collector preserve source/hash/cleanup gates without claiming public acceptance", async () => {
  const workflow = makeAlignment16Workflow(await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"));
  assert.ok(workflow.includes("node media/ffmpeg/build-mpeg2-packet-drain.mjs"));
  const branch = makePacketDrainBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"), root);
  const collector = makePacketDrainCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"), root);
  syntax(branch.generated); syntax(collector.generated);
  assert.ok(branch.generated.includes("codex/mpeg2-packet-drain-20261015"));
  for (const token of ["names.length <= 20", "16 * 1024 ** 2", "experiment.queuedPayloadAllocations, 8", "mvfSmoke.initErrorFlagCases, 4",
    "manifest.packetDrain.onlyQueueDrainAdded, true", "containerPacketOrderMayChange", "await runtime.close()"])
    assert.ok(collector.generated.includes(token), token);
});
