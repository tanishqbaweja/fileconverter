import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const BASE_SPLIT_RECIPE_SHA256 = "eb00f3f3a23319e8b067d7d19bd41432df2b319a85a93ac4ad4f032a84ed9574";
export function makeAlignedReuseRecipe(source) {
  assert.equal(createHash("sha256").update(source).digest("hex"), BASE_SPLIT_RECIPE_SHA256, "Frozen baseline recipe changed");
  const patches = [
    ['SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"', 'SCRIPT_DIR="${WITHIN_ALIGNED_REUSE_SCRIPT_DIR:?}"'],
    ['emcc "${BUILD_ROOT}/within_split_pipeline.c" -I"${PREFIX}/include"',
      'emcc "${BUILD_ROOT}/within_split_pipeline.c" "${SCRIPT_DIR}/mpeg2-aligned-reuse.c" -I"${PREFIX}/include"'],
    ['-Wl,--no-entry -o "${OUTPUT_ROOT}/within-mpeg2-split.mjs"',
      '-Wl,--wrap=posix_memalign -Wl,--no-entry -o "${OUTPUT_ROOT}/within-mpeg2-split.mjs"'],
  ];
  let generated = source;
  for (const [before, after] of patches) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of patches) { assert.equal(reversed.split(after).length, 2); reversed = reversed.replace(after, before); }
  assert.equal(reversed, source);
  return generated;
}
