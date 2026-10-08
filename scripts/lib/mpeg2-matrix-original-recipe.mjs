// Only the measured fully rendered matrix CSS differs from the last full attempt.
import assert from "node:assert/strict";
import { makeLateAllocatorOriginalDriver } from "./mpeg2-late-allocator-original-recipe.mjs";
import { DYNAMIC_FLEX_CSS } from "./ui-flex-layout-recipe.mjs";
import { MATRIX_FLEX_CSS } from "./ui-matrix-flex-layout-recipe.mjs";

export function makeMatrixOriginalDriver(...args) {
  const prior = makeLateAllocatorOriginalDriver(...args);
  const patches = [
    [`const cssCandidate = { css: ${JSON.stringify(DYNAMIC_FLEX_CSS)},`,
      `const cssCandidate = { css: ${JSON.stringify(DYNAMIC_FLEX_CSS + MATRIX_FLEX_CSS)},`],
    ['const sourceFiles = ["scripts/mpeg2-late-allocator-original-memory.mjs",',
      'const sourceFiles = ["scripts/mpeg2-matrix-original-memory.mjs","scripts/lib/mpeg2-matrix-original-recipe.mjs","scripts/lib/ui-matrix-flex-layout-recipe.mjs",'+
      '"scripts/validate-mpeg2-matrix-goldens.mjs","scripts/lib/mpeg2-matrix-golden-recipe.mjs","scripts/freeze-mpeg2-matrix-goldens.mjs","scripts/freeze-mpeg2-matrix-goldens-compact.mjs",'+
      '"evidence/2026-10-08T08-50-53-044Z-mpeg2-matrix-golden-validation.json",'+
      '"evidence/2026-10-08T08-38-48-399Z-ui-matrix-flex-layout-analysis.json","scripts/mpeg2-late-allocator-original-memory.mjs",'],
    ['-private-mpeg2-late-allocator-original-native-100ms', '-private-mpeg2-matrix-original-native-100ms'],
    ['"mpeg2-late-allocator-original-runtime-"', '"mpeg2-matrix-original-runtime-"'],
    ['Full protected original with equivalent flex CSS/compiled3e744 pending-pool and bounded allocator-header fatal observer;',
      'Full protected original with fully rendered405card matrix flex PLUS prior dynamic flex CSS/compiled3e744 pending-pool and bounded allocator-header fatal observer;'],
  ];
  let result = prior;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result; for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, prior, "Full input/protected SHA/disk/defaults/codec/quality/fixed32+16MiB/lower stable blank/ALL processes250MiB/three repeats/validators/recovery/finally unchanged");
  assert.doesNotMatch(MATRIX_FLEX_CSS, /content-visibility|visibility:|display:none|order:/);
  return result;
}
