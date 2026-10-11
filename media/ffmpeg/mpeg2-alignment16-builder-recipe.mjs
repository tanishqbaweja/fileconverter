// Transform actual outer builder, not just syntax-check it. Anchor declarations
// and imports so nested historical recipe literals remain byte-for-byte intact.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "../../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
export function makeAlignment16Builder(prior, root) {
  assert.equal(sha(prior), "c480eb623e1a9b0bb8d5e128ebc7c3b07b7227ae4be6a7bae5f1a3315c2a4467");
  assert.equal(path.resolve(root), root);
  const edits = [
    ['const root = path.resolve(import.meta.dirname, "../..")', `const root = ${JSON.stringify(root)}`],
    ['path.join(root, "media/ffmpeg/mpeg2-allocation-attempt-recipe.mjs")', 'path.join(root, "media/ffmpeg/mpeg2-alignment16-recipe.mjs")'],
    ['makeAllocationAttemptRecipe as makeAlignedReuseRecipe', 'makeAlignment16Recipe as makeAlignedReuseRecipe'],
    ['path.resolve(import.meta.dirname, file)', 'path.resolve(root, "media/ffmpeg", file)'],
    ...["stable-ui-headless-baseline-recipe.mjs", "owned-runtime-scratch.mjs", "wasm-stack-symbols.mjs"].map(file =>
      [`from "../../scripts/lib/${file}"`, `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib", file)).href)}`]),
  ];
  let generated = prior;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let restored = generated; for (const [before, after] of edits.toReversed()) restored = restored.replace(after, before);
  assert.equal(restored, prior, "All unrelated nested transformations and native gates remain exact");
  return { generated, generatedSha256: sha(generated), edits };
}
