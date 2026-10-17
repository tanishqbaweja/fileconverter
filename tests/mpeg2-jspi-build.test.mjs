import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { transform } from "esbuild";
import { makeJspiShellRecipe, makeJspiHostedBuilder, makeAlignment16Builder,
  makePacketCacheOuterBuilder, makePacketCacheHevcWrapper, makePacketCachePipelineGenerator,
} from "../media/ffmpeg/mpeg2-jspi-builder-recipe.mjs";
import { makeAlignment16Workflow, makeJspiBranchCaller, makeJspiCollector } from "../scripts/lib/jspi-build-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), read = file => readFile(path.join(root, file), "utf8");
test("only decoder suspension compilation changes; exact reversal preserves codecs, I/O, heaps and encoder", async () => {
  const recipe = makeJspiShellRecipe(await read("media/ffmpeg/build-mpeg2-split-pipeline.sh"));
  assert.equal(recipe.edits.length, 2); let restored = recipe.generated;
  for (const [before, after] of recipe.edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, recipe.parent); assert.match(recipe.generated, /-sJSPI=1 -sJSPI_EXPORTS='\["within_remux"\]'/);
  assert.doesNotMatch(recipe.generated, /-sASYNCIFY/); assert.match(recipe.generated, /-sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432/);
  assert.match(recipe.generated, /build-mpeg2-split-encoder.sh/); assert.match(recipe.generated, /-sSTACK_OVERFLOW_CHECK=2/);
  assert.equal(recipe.publicAcceptance, false);
});
test("nested actual builder routes to JSPI shell without changing native kernel or parent gates", async () => {
  const inner = makeAlignment16Builder(await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), root);
  assert.match(inner.generated, /makeJspiShellText as makeAlignedReuseRecipe/);
  assert.match(makePacketCacheOuterBuilder(await read("media/ffmpeg/build-mpeg2-alignment16.mjs"), root).generated, /mpeg2-jspi-builder-recipe/);
  assert.match(makePacketCacheHevcWrapper(await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs"), root).generated, /mpeg2-jspi-builder-recipe/);
  const pipeline = makePacketCachePipelineGenerator(await read("media/ffmpeg/make-mpeg2-split-pipeline.mjs"), root);
  assert.ok(pipeline.generated.includes(pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-duration-drain-source.mjs")).href));
  const hosted = makeJspiHostedBuilder(await read("media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"), root);
  assert.match(hosted.generated, /manifest.asyncifyStackBytesDecoder = 0/);
  assert.match(hosted.generated, /engineManagedStackMemoryBytes: null/);
  assert.match(hosted.generated, /duration.invalidCases, 15/); assert.match(hosted.generated, /reuseIterations, 200000/);
  assert.match(hosted.generated, /8b2fd64d3205143971d451f0ed562039d98fbac9f276d6cbb3c8898d889f4242/);
});
test("private workflow/branch/collector retain no-Docker, ownership, hashes, fixed heaps and acceptance holds", async () => {
  const workflow = makeAlignment16Workflow(await read(".github/workflows/reproduce-ffmpeg-nondocker.yml"));
  assert.match(workflow, /node media\/ffmpeg\/build-mpeg2-jspi.mjs/); assert.doesNotMatch(workflow, /docker (?:build|run)/);
  const branch = makeJspiBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"), root);
  assert.match(branch.generated, /codex\/mpeg2-jspi-20261018/); assert.match(branch.generated, /GIT_INDEX_FILE/);
  assert.match(branch.generated, /windowsHide: true/); assert.match(branch.generated, /mainUnchanged: true/);
  const collector = makeJspiCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"), root);
  assert.match(collector.generated, /work\/mpeg2-jspi-\$\{runId\}/); assert.match(collector.generated, /heapLimitsChanged/);
  assert.match(collector.generated, /engineManagedStackIncludedInProcessTreeMeasurement, true/);
  assert.match(collector.generated, /complete = true/); assert.match(collector.generated, /await runtime.close\(\)/);
});
test("all actual nested generated JavaScript parses before a hosted build can start", async () => {
  const candidates = [
    makeAlignment16Builder(await read("media/ffmpeg/build-mpeg2-allocation-attempt.mjs"), root),
    makePacketCacheOuterBuilder(await read("media/ffmpeg/build-mpeg2-alignment16.mjs"), root),
    makePacketCacheHevcWrapper(await read("media/ffmpeg/build-mpeg2-hevc-planes.mjs"), root),
    makePacketCachePipelineGenerator(await read("media/ffmpeg/make-mpeg2-split-pipeline.mjs"), root),
    makeJspiHostedBuilder(await read("media/ffmpeg/build-mpeg2-packet-largest-idle.mjs"), root),
    makeJspiBranchCaller(await read("scripts/prepare-alignment16-build-branch.mjs"), root),
    makeJspiCollector(await read("scripts/collect-mpeg2-single-idle-build.mjs"), root),
  ];
  for (const candidate of candidates) await transform(candidate.generated, { loader: "js", format: "esm", target: "es2022" });
  assert.equal(candidates.length, 7);
});
