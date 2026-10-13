import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Builder as priorInner, makePacketCacheOuterBuilder as priorOuter, makePacketCacheHevcWrapper as priorHevc,
  makePacketCachePipelineGenerator as priorPipeline } from "./mpeg2-packet-cache-strict-builder-recipe.mjs";
function transform(prior, edits) {
  let generated = prior.generated;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior.generated); return { generated, generatedSha256: sha(generated), edits, prior };
}
export function makeAlignment16Builder(source, root) {
  return transform(priorInner(source, root), [
    ["media/ffmpeg/mpeg2-packet-cache-strict-recipe.mjs", "media/ffmpeg/mpeg2-packet-largest-idle-recipe.mjs"],
    ["makePacketCacheRecipeStrict as makeAlignedReuseRecipe", "makeLargestIdleRecipe as makeAlignedReuseRecipe"],
  ]);
}
const helperEdit = root => [[pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-cache-strict-builder-recipe.mjs")).href,
  pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-largest-idle-builder-recipe.mjs")).href]];
export function makePacketCacheOuterBuilder(source, root) { return transform(priorOuter(source, root), helperEdit(root)); }
export function makePacketCacheHevcWrapper(source, root) { return transform(priorHevc(source, root), helperEdit(root)); }
export function makePacketCachePipelineGenerator(source, root) {
  return transform(priorPipeline(source, root), [[pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-cache-source.mjs")).href,
    pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-largest-idle-source.mjs")).href]]);
}
