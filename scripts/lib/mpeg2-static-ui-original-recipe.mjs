// New acceptance attempt differs only by measured static UI reuse, not the engine.
import assert from "node:assert/strict";
import { makeSettledOriginalDriver } from "./mpeg2-settled-original-recipe.mjs";
export function makeStaticUiOriginalDriver(source, root, resolvePackage) {
  const settled = makeSettledOriginalDriver(source, root, resolvePackage);
  const changes = [
    ['const sourceFiles = ["scripts/mpeg2-settled-original-memory.mjs",', 'const sourceFiles = ["scripts/mpeg2-static-ui-original-memory.mjs", "scripts/lib/mpeg2-static-ui-original-recipe.mjs", "app/converter/ConverterApp.tsx", "scripts/lib/static-format-matrix-recipe.mjs", "evidence/ui-matrix-benchmark-2026-10-07.json", "evidence/ui-matrix-golden-regression-2026-10-07.json", "evidence/ui-privacy-offline-2026-10-06T21-40-31-968Z.json", "scripts/mpeg2-settled-original-memory.mjs",'],
    ['-private-mpeg2-split-settled-original-native-100ms', '-private-mpeg2-static-ui-original-native-100ms'],
    ['"mpeg2-settled-original-runtime-"', '"mpeg2-static-ui-original-runtime-"'],
    ['Full protected original via unchanged production pipeline, prospective five-minute blank startup settling before converter load; no flags/process exclusions/larger baseline, same full250MiB gate/quality/fidelity/three runs. No native OS-picker or speed-A/B certification', 'Full protected original after measured static405card UI reuse, unchanged codec/settings/Chrome/allprocesses250MiB/formula/three runs/fidelity/cleanup, fixed five-minute startup settling/no larger denominator. No native OS-picker or conversion-speed-A/B certification'],
  ];
  let generated = settled;
  for (const [before, after] of changes) { assert.equal(generated.split(before).length, 2, before); generated = generated.replace(before, after); }
  let reversed = generated;
  for (const [before, after] of changes) { assert.equal(reversed.split(after).length, 2, after); reversed = reversed.replace(after, before); }
  assert.equal(reversed, settled);
  return generated;
}
