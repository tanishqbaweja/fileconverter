import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { makeAlignment16Builder } from "./mpeg2-alignment16-builder-recipe.mjs";
export function makeAlignment16BuilderForHevcPlanes(source, root) {
  const prior = makeAlignment16Builder(source, root), edits = [
    ["media/ffmpeg/mpeg2-alignment16-recipe.mjs", "media/ffmpeg/mpeg2-hevc-plane-recipe.mjs"],
    ["makeAlignment16Recipe as makeAlignedReuseRecipe", "makeHevcPlaneRecipe as makeAlignedReuseRecipe"],
  ];
  let generated = prior.generated;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reverse = generated; for (const [before, after] of edits.toReversed()) reverse = reverse.replace(after, before);
  assert.equal(reverse, prior.generated);
  return { generated, generatedSha256: sha(generated), priorAlignment16: prior, edits };
}
export { makeAlignment16BuilderForHevcPlanes as makeAlignment16Builder };
export function makeHevcPlaneOuterBuilder(source, root) {
  assert.equal(sha(source), "c44148bd6b1340a1b96b2687c2a48ae6e773ef43805c2d95e1c62f7bbde60495");
  const edits = [['root = path.resolve(import.meta.dirname, "../..")', `root = ${JSON.stringify(path.resolve(root))}`]];
  for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
    const relative = match[1] === "./mpeg2-alignment16-builder-recipe.mjs" ? "./mpeg2-hevc-plane-builder-recipe.mjs" : match[1];
    edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "media/ffmpeg", relative)).href)}`)]);
  }
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated; for (const [before, after] of edits.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "Actual SDK restoration/13-case contracts/old encoder and source gates preserved");
  return { generated, generatedSha256: sha(generated), edits };
}
