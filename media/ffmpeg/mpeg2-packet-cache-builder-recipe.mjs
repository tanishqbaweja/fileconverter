import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16BuilderForHevcPlanes, makeHevcPlaneOuterBuilder } from "./mpeg2-hevc-plane-builder-recipe.mjs";
function transform(source, edits) {
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source); return { generated, generatedSha256: sha(generated), edits };
}
export function makeAlignment16Builder(source, root) {
  const prior = makeAlignment16BuilderForHevcPlanes(source, root);
  return transform(prior.generated, [
    ["media/ffmpeg/mpeg2-hevc-plane-recipe.mjs", "media/ffmpeg/mpeg2-packet-cache-recipe.mjs"],
    ["makeHevcPlaneRecipe as makeAlignedReuseRecipe", "makePacketCacheRecipe as makeAlignedReuseRecipe"],
  ]);
}
export function makePacketCacheOuterBuilder(source, root) {
  const prior = makeHevcPlaneOuterBuilder(source, root);
  return transform(prior.generated, [[pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-hevc-plane-builder-recipe.mjs")).href,
    pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-cache-builder-recipe.mjs")).href]]);
}
export function makePacketCachePipelineGenerator(source, root) {
  assert.equal(sha(source), "bfcdabf4e36b9c339bab2558a5177dbc23e005aa14e75dcd8af2c24b328232dd");
  return transform(source, [
    ['import { makeMpeg2SplitKernel } from "./mpeg2-split-kernel.mjs";',
      `import { makePacketCacheKernel as makeMpeg2SplitKernel, makePacketCacheBridge } from ${JSON.stringify(pathToFileURL(path.join(root, "media/ffmpeg/mpeg2-packet-cache-source.mjs")).href)};`],
    ['directory = import.meta.dirname', `directory = ${JSON.stringify(path.join(root, "media/ffmpeg"))}`],
    ['const generated = bridge + artwork + \'#include "mpeg2-split-mux-bridge.h"\\n\' + kernel;',
      'const mux = makePacketCacheBridge(await readFile(path.join(directory, "mpeg2-split-mux-bridge.h"), "utf8"));\nawait writeFile(path.join(path.dirname(output), "mpeg2-packet-cache-mux-bridge.h"), mux, { flag: "wx" });\nconst generated = bridge + artwork + \'#include "mpeg2-packet-cache-mux-bridge.h"\\n\' + kernel;'],
  ]);
}
export function makePacketCacheHevcWrapper(source, root) {
  assert.equal(sha(source), "2eaef641b07bfdef904f2e1ba05300cc28b230989894e7c69dedf828642e7e7d");
  const edits = [['root = path.resolve(import.meta.dirname, "../..")', `root = ${JSON.stringify(root)}`]];
  for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
    const relative = match[1] === "./mpeg2-hevc-plane-builder-recipe.mjs" ? "./mpeg2-packet-cache-builder-recipe.mjs" : match[1];
    edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "media/ffmpeg", relative)).href)}`)]);
  }
  const prior = transform(source, edits); assert.equal(prior.generated.split("makeHevcPlaneOuterBuilder").length, 3);
  const generated = prior.generated.replaceAll("makeHevcPlaneOuterBuilder", "makePacketCacheOuterBuilder");
  assert.equal(generated.replaceAll("makePacketCacheOuterBuilder", "makeHevcPlaneOuterBuilder"), prior.generated);
  return { generated, generatedSha256: sha(generated), prior, helperOccurrences: 2 };
}
