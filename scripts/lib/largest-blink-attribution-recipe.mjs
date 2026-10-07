// Preserve all executed failed prerequisite sources and their exact hashes.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeDetailedBlinkAttribution as helper } from "./detailed-blink-attribution-recipe.mjs";
import { makeSingleDetailedBlinkControl as control } from "./single-detailed-blink-control-recipe.mjs";
import { makeBoundedTypeDriver } from "./bounded-name-detailed-blink-recipe.mjs";
const change = (source, before, after, occurrences = 1) => {
  assert.equal(source.split(before).length, occurrences + 1, before);
  const result = source.replaceAll(before, after); assert.equal(result.replaceAll(after, before), source); return result;
};
const url = (root, name) => JSON.stringify(pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href);
export function makeDetailedBlinkAttribution(source, root) {
  return change(helper(source, root), `from ${url(root, "detailed-blink-type-summary")};`, `from ${url(root, "largest-blink-type-summary")};`);
}
export function makeSingleDetailedBlinkControl(source, root, helperUrl) {
  let result = control(source, root, helperUrl);
  result = change(result, '"scripts/probe-single-detailed-blink-types.mjs",',
    '"scripts/probe-largest-blink-types.mjs", "scripts/lib/largest-blink-type-summary.mjs", "scripts/lib/largest-blink-attribution-recipe.mjs", "scripts/lib/bounded-detailed-blink-type-summary.mjs", "scripts/probe-single-detailed-blink-types.mjs",');
  result = change(result, 'scope: "actual-single-detailed-blink-type-blank-browser-prerequisite"',
    'scope: "actual-largest64-detailed-blink-type-blank-browser-prerequisite"');
  return change(result, '-single-detailed-blink-type-control.json', '-largest-blink-type-control.json');
}
export function makeLargestTypeDriver(source, root) {
  let result = makeBoundedTypeDriver(source, root);
  result = change(result, `from ${url(root, "bounded-name-detailed-blink-recipe")};`, `from ${url(root, "largest-blink-attribution-recipe")};`, 2);
  result = change(result, 'evidence/bounded-detailed-blink-type-control-2026-10-07.json', 'evidence/largest-blink-type-control-2026-10-07.json');
  result = change(result, 'completed-bounded-detailed-blink-type-control', 'completed-largest-blink-type-control', 2);
  return change(result, 'failed-bounded-detailed-blink-type-control', 'failed-largest-blink-type-control');
}
