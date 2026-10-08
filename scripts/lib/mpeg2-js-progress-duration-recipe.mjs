import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeJsProgressOriginalDriver } from "./mpeg2-js-progress-recipe.mjs";
export function makeDurationBoundJsProgressOriginalDriver(...args) {
  const original = makeJsProgressOriginalDriver(...args), uri = name => JSON.stringify(pathToFileURL(path.join(args[1], `scripts/lib/${name}.mjs`)).href);
  const patches = [
    [`import { createConversionJsAllocation } from ${uri("conversion-js-allocation")};`,
      `import { createConversionJsAllocation } from ${uri("conversion-js-allocation-duration-bound")};`],
    ['const sourceFiles = ["scripts/mpeg2-js-progress-original.mjs",',
      'const sourceFiles = ["scripts/mpeg2-js-progress-duration-bound.mjs","scripts/lib/mpeg2-js-progress-duration-recipe.mjs","scripts/lib/conversion-js-allocation-duration-bound.mjs","tests/conversion-js-allocation-duration.test.mjs","scripts/mpeg2-js-progress-original.mjs",'],
    ['-private-mpeg2-js-progress-original-native-100ms', '-private-mpeg2-js-duration-progress-original-native-100ms'],
    ['"mpeg2-js-progress-original-runtime-"', '"mpeg2-js-duration-progress-runtime-"'],
  ];
  let result = original;
  for (const [before, after] of patches) { assert.equal(result.split(before).length, 2, before); result = result.replace(before, after); }
  let reversed = result;
  for (const [before, after] of patches.toReversed()) reversed = reversed.replace(after, before);
  assert.equal(reversed, original, "Only sampler lifetime/provenance; do not shorten conversion, source or any full-original gate");
  return result;
}
