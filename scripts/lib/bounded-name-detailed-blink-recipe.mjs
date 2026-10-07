import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeDetailedBlinkAttribution as originalHelper } from "./detailed-blink-attribution-recipe.mjs";
import { makeSingleDetailedBlinkControl as originalControl } from "./single-detailed-blink-control-recipe.mjs";
const change = (source, before, after) => {
  assert.equal(source.split(before).length, 2, before); return source.replace(before, after);
};
export function makeDetailedBlinkAttribution(source, root) {
  const url = name => JSON.stringify(pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href);
  return change(originalHelper(source, root), `from ${url("detailed-blink-type-summary")};`, `from ${url("bounded-detailed-blink-type-summary")};`);
}
export function makeSingleDetailedBlinkControl(source, root, helperUrl) {
  let generated = originalControl(source, root, helperUrl);
  generated = change(generated, '"scripts/probe-single-detailed-blink-types.mjs",',
    '"scripts/probe-bounded-detailed-blink-types.mjs", "scripts/lib/bounded-name-detailed-blink-recipe.mjs", "scripts/lib/bounded-detailed-blink-type-summary.mjs", "scripts/probe-single-detailed-blink-types.mjs",');
  generated = change(generated, 'scope: "actual-single-detailed-blink-type-blank-browser-prerequisite"',
    'scope: "actual-bounded-name-single-detailed-blink-type-blank-browser-prerequisite"');
  return change(generated, '-single-detailed-blink-type-control.json', '-bounded-name-single-detailed-blink-type-control.json');
}
export function makeBoundedTypeDriver(source, root) {
  assert.equal(createHash("sha256").update(source).digest("hex"), "8bea9a0b8a0f4b7a913b8c99b2b802f8daf0146926acd5298ac6ed53cdd5c6d2");
  const url = name => JSON.stringify(pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href);
  const patches = [
    ['const root = path.resolve(import.meta.dirname, ".."), sha', `const root = ${JSON.stringify(root)}, sha`],
    ['from "./lib/owned-runtime-scratch.mjs";', `from ${url("owned-runtime-scratch")};`],
    ['import { makeDetailedBlinkAttribution } from "./lib/detailed-blink-attribution-recipe.mjs";', `import { makeDetailedBlinkAttribution } from ${url("bounded-name-detailed-blink-recipe")};`],
    ['import { makeSingleDetailedBlinkControl } from "./lib/single-detailed-blink-control-recipe.mjs";', `import { makeSingleDetailedBlinkControl } from ${url("bounded-name-detailed-blink-recipe")};`],
    ['single-detailed-blink-driver-', 'bounded-type-blink-driver-'],
    ['evidence/single-detailed-blink-type-control-2026-10-07.json', 'evidence/bounded-detailed-blink-type-control-2026-10-07.json'],
    ['completed-single-detailed-blink-type-control', 'completed-bounded-detailed-blink-type-control'],
    ['failed-single-detailed-blink-type-control', 'failed-bounded-detailed-blink-type-control'],
  ];
  let generated = source;
  for (const [before, after] of patches) {
    // The completed-status token occurs in both the assignment and exit check.
    const expected = before === 'completed-single-detailed-blink-type-control' ? 3 : 2;
    assert.equal(generated.split(before).length, expected, before); generated = generated.replaceAll(before, after);
  }
  let reversed = generated;
  for (const [before, after] of [...patches].reverse()) reversed = reversed.replaceAll(after, before);
  assert.equal(reversed, source, "Only approved driver binding/provenance changes");
  return generated;
}
