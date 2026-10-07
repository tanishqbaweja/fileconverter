// Explicit source-pinned measurement derivative. Unlike the earlier import-only
// derivative, THIS changes light to detailed and must prove its caps in Chrome.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeCompleteBlinkControl } from "./complete-blink-attribution-recipe.mjs";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const change = (source, before, after) => {
  assert.equal(source.split(before).length, 2, before);
  const changed = source.replace(before, after); assert.equal(changed.replace(after, before), source); return changed;
};
export function makeDetailedBlinkAttribution(source, root) {
  assert.equal(sha(source), "ee5ce8eded7290a230c1eda69404bde6bd79ab4225c45ee1589677f3abf8cdb2");
  const url = pathToFileURL(path.join(root, "scripts/lib/detailed-blink-type-summary.mjs")).href;
  const patches = [
    ['from "./memory-infra-attribution.mjs";', `from ${JSON.stringify(url)};`],
    ['allowed_dump_modes: ["light"]', 'allowed_dump_modes: ["detailed"]'],
    ['levelOfDetail: "light"', 'levelOfDetail: "detailed"'],
  ];
  let generated = source;
  for (const [before, after] of patches) generated = change(generated, before, after);
  let reversed = generated;
  for (const [before, after] of [...patches].reverse()) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "Only summary import and the two explicit dump-mode changes");
  return generated;
}
export function makeDetailedBlinkControl(source, root, helperUrl) {
  let generated = makeCompleteBlinkControl(source, root, helperUrl);
  generated = change(generated, '"scripts/probe-complete-blink-heap.mjs",',
    '"scripts/probe-detailed-blink-types.mjs", "scripts/lib/detailed-blink-attribution-recipe.mjs", "scripts/lib/detailed-blink-type-summary.mjs", "scripts/probe-complete-blink-heap.mjs",');
  generated = change(generated, 'scope: "actual-complete-blink-brief-heap-synthetic-blank-browser-prerequisite"',
    'scope: "actual-detailed-blink-type-synthetic-blank-browser-prerequisite"');
  return change(generated, "-complete-blink-heap-control.json", "-detailed-blink-type-control.json");
}
