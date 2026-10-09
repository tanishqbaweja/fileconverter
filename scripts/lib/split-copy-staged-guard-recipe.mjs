// Correct the frozen driver's obsolete adapter binding, not its conversion gates.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export const copyAdapterBinding = Object.freeze({ bytes: 19517,
  sha256: "e03a7fb4f1cdf2eaec676a0e5ebfee570ae71e9738ed3195f2a765ec42daace6" });
const oldHash = "020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837";
export function correctSplitCopyStagedGuard(source) {
  const patches = [
    ["assert.equal((await stat(file)).size,18330);", `assert.equal((await stat(file)).size,${copyAdapterBinding.bytes});`],
    [oldHash, copyAdapterBinding.sha256],
    ["stagedAdapters.push({name,bytes:18330,", `stagedAdapters.push({name,bytes:${copyAdapterBinding.bytes},`],
  ];
  let generated = source;
  for (const [index, [before, after]] of patches.entries()) {
    assert.equal(generated.split(before).length, index === 1 ? 3 : 2, before);
    generated = generated.replaceAll(before, after);
  }
  let restored = generated;
  for (const [before, after] of patches.toReversed()) restored = restored.replaceAll(after, before);
  assert.equal(restored, source);
  return { generated, patches, originalSha256: sha(source), generatedSha256: sha(generated),
    adapterBinding: copyAdapterBinding, conversionGatesChanged: false };
}
