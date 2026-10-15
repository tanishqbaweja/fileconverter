// Storage diagnostic only: never replace an observed lower stable denominator
// with a larger late blank. Does not alter any media/full-original gate.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function chooseLowerCopyDiagnosticBlank(early, settled) {
  for (const row of [early, settled]) {
    assert.equal(row?.stable, true); assert.ok(Number.isSafeInteger(row.privateBytes) && row.privateBytes > 0);
    assert.ok(row.minimumElapsedMs >= 8000 && row.sampleCount >= 5);
  }
  return early.privateBytes <= settled.privateBytes ? early : settled;
}
export function makeLowerCopyDiagnostic(source, root) {
  assert.equal(sha(source), "4bebe9be27a9e46570e812ac9a1734a79362aeb8a7558b378978bd9012e4ba95");
  const namespaced = source.replaceAll("${stamp}-exclusive-staged-copy", "${stamp}-exclusive-staged-copy-lower");
  const edits = [[source, namespaced],
    ['const root = path.resolve(import.meta.dirname, ".."), stamp =', `const root = ${JSON.stringify(root)}, stamp =`],
    ['import { chromium } from "@playwright/test";', `import { chromium } from ${JSON.stringify(pathToFileURL(path.join(root, "node_modules/@playwright/test/index.mjs")).href)};`],
    ['  state.blank = await stableBlank(); assert.ok(state.blank.privateBytes <= early.privateBytes, "No larger replacement baseline");',
      `  const settled = await stableBlank();
  state.blank = (${chooseLowerCopyDiagnosticBlank.toString()})(early, settled);
  state.blankWindows = { early, settled, chosenLower: true, storageOnlyNotFullMediaAcceptance: true };
  assert.ok(state.blank.privateBytes <= early.privateBytes && state.blank.privateBytes <= settled.privateBytes);`],
    ['const files = ["scripts/benchmark-exclusive-staged-copy.mjs",',
      'const files = ["scripts/benchmark-exclusive-staged-copy-lower.mjs", "scripts/lib/exclusive-copy-lower-baseline.mjs", "scripts/benchmark-exclusive-staged-copy.mjs",'],
  ];
  // The selection helper uses only assertion guards, so bind the same assertion
  // function in the generated diagnostic rather than inventing an environment.
  for (const match of namespaced.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm))
    edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", match[1])).href)}`)]);
  return exactPatch(source, edits);
}
