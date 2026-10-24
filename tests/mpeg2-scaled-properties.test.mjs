import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { transform } from "esbuild";
import { makeDurationDrainKernel } from "../media/ffmpeg/mpeg2-duration-drain-source.mjs";
import { makeScaledPropertiesKernel } from "../media/ffmpeg/mpeg2-scaled-properties-source.mjs";
import { makeScaledPropertiesShellRecipe, makeScaledPropertiesHostedBuilder, makeAlignment16Builder,
  makePacketCacheOuterBuilder, makePacketCacheHevcWrapper, makePacketCachePipelineGenerator,
} from "../media/ffmpeg/mpeg2-scaled-properties-builder-recipe.mjs";
import { makeAlignment16Workflow, makeScaledPropertiesBranchCaller, makeScaledPropertiesCollector } from "../scripts/lib/scaled-properties-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
test("only the reused scaler frame's old properties are replaced; exact parent kernel restored", async () => {
  const source = await read("media/ffmpeg/mpeg2-candidate.c"), parent = makeDurationDrainKernel(source), changed = makeScaledPropertiesKernel(source);
  let restored = changed.generated.slice(changed.scaledPropertiesInclude.length);
  for (const [before, after] of changed.scaledPropertiesEdits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, parent.generated); assert.equal(changed.scaledPropertiesParent, parent.generated);
  assert.equal(changed.scaledPropertiesEdits.length, 1); assert.equal(changed.bFramePolicyChanged, false);
  assert.equal(changed.parent, parent.parent); assert.equal(changed.originalKernel, parent.originalKernel);
  assert.match(changed.generated, /within_mpeg2_replace_scaled_properties\(p->converted, frame\)/);
  assert.equal(changed.publicAcceptance, false);
});
test("helper clears stale properties before copying while leaving pixels and source untouched", async () => {
  const helper = await read("media/ffmpeg/mpeg2-scaled-frame-properties.h");
  assert.ok(helper.indexOf("av_frame_side_data_free(") < helper.indexOf("return av_frame_copy_props("));
  assert.ok(helper.indexOf("av_dict_free(") < helper.indexOf("return av_frame_copy_props("));
  assert.doesNotMatch(helper, /av_frame_unref\(|av_frame_get_buffer\(|->pict_type\s*=|->data\[.*=/);
  const wire = await read("media/ffmpeg/mpeg2-split-frame-properties.h");
  assert.match(wire, /WITHIN_SPLIT_PROPS_CAPACITY 65536/);
});
test("actual Wasm lifecycle unit and pipeline change are reversible; fixed heaps and JSPI retained", async () => {
  const recipe = makeScaledPropertiesShellRecipe(await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"));
  let restored = recipe.generated; for (const [before, after] of recipe.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, recipe.parent); assert.equal(recipe.edits.length, 2);
  assert.match(recipe.generated, /node "\$\{BUILD_ROOT\}\/scaled-properties-smoke.js"/);
  assert.match(recipe.generated, /tests\/native\/mpeg2-scaled-frame-properties.c/);
  assert.match(recipe.generated, /make-mpeg2-scaled-properties-pipeline.mjs/);
  assert.match(recipe.generated, /-sJSPI=1/); assert.doesNotMatch(recipe.generated, /-sASYNCIFY/);
  assert.match(recipe.generated, /-sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432/);
  assert.match(recipe.generated, /-sALLOW_MEMORY_GROWTH=0/); assert.equal(recipe.publicAcceptance, false);
});
test("all nested generated programs parse and preserve parent gates, provenance and cleanup", async () => {
  const inner = makeAlignment16Builder(await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), root);
  const outer = makePacketCacheOuterBuilder(await read("media/ffmpeg/build-mpeg2-alignment16.mjs"), root);
  const hevc = makePacketCacheHevcWrapper(await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs"), root);
  const pipeline = makePacketCachePipelineGenerator(await read("media/ffmpeg/make-mpeg2-split-pipeline.mjs"), root);
  const hosted = makeScaledPropertiesHostedBuilder(await read("media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"), root);
  const branch = makeScaledPropertiesBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"), root);
  const collector = makeScaledPropertiesCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"), root);
  for (const candidate of [inner, outer, hevc, pipeline, hosted, branch, collector])
    await transform(candidate.generated, { loader: "js", format: "esm", target: "es2022" });
  assert.match(inner.generated, /makeScaledPropertiesShellText as makeAlignedReuseRecipe/);
  for (const candidate of [outer, hevc]) assert.match(candidate.generated, /mpeg2-scaled-properties-builder-recipe/);
  assert.match(pipeline.generated, /mpeg2-scaled-properties-source.mjs/);
  assert.match(hosted.generated, /scaled.oldWireResult, scaled.expectedWireResult/); assert.match(hosted.generated, /scaled.correctedCopies, 1000/);
  assert.match(hosted.generated, /duration.invalidCases, 15/); assert.match(hosted.generated, /reuseIterations, 200000/);
  assert.match(hosted.generated, /8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242/);
  assert.match(branch.generated, /codex\/mpeg2-scaled-properties-20261024/); assert.match(branch.generated, /GIT_INDEX_FILE/);
  assert.match(branch.generated, /windowsHide: true/); assert.match(branch.generated, /mainUnchanged: true/);
  assert.match(collector.generated, /work\/mpeg2-scaled-properties-\$\{runId\}/);
  assert.match(collector.generated, /expectedScaled.generated/); assert.match(collector.generated, /sideDataLimit, 16/);
  assert.match(collector.generated, /await runtime.close\(\)/);
});
test("private hosted workflow changes only its selected builder, never uses Docker", async () => {
  const workflow = makeAlignment16Workflow(await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"));
  assert.match(workflow, /node media\/ffmpeg\/build-mpeg2-scaled-properties.mjs/);
  assert.doesNotMatch(workflow, /docker (?:build|run)/); assert.match(workflow, /Remove repository-local build data/);
});
