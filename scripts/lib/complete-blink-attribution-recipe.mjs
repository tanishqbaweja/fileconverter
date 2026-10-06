// Preserve actually executed historical helper/control sources. The sole trace
// helper change is its summary import, not dump mode/categories/buffers/GC.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
const change = (source, before, after) => {
  assert.equal(source.split(before).length, 2, before);
  const result = source.replace(before, after); assert.equal(result.replace(after, before), source); return result;
};
export function makeCompleteBlinkAttribution(source, root) {
  assert.equal(sha(source), "ee5ce8eded7290a230c1eda69404bde6bd79ab4225c45ee1589677f3abf8cdb2");
  const url = pathToFileURL(path.join(root, "scripts/lib/complete-blink-heap-summary.mjs")).href;
  return change(source, 'from "./memory-infra-attribution.mjs";', `from ${JSON.stringify(url)};`);
}
export function makeCompleteBlinkControl(source, root, helperUrl) {
  assert.equal(sha(source), "39eee5e4339dc66bf5b4f7b89de480ab806db09a3c0f7a1429c289d51d161209");
  assert.ok(helperUrl.startsWith("file:"));
  const patches = [
    ['const root = path.resolve(import.meta.dirname, ".."), exec', `const root = ${JSON.stringify(root)}, exec`],
    ...["owned-runtime-scratch", "cdp-realm-memory", "burst-memory-observer"].map(name =>
      [`from "./lib/${name}.mjs";`, `from ${JSON.stringify(pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href)};`]),
    ['from "./lib/bounded-renderer-attribution.mjs";', `from ${JSON.stringify(helperUrl)};`],
    ["let runtime, chrome, browser, realms, attribution, observer, page;",
      "export let completedReport = null, completedReportPath = null;\nlet runtime, chrome, browser, realms, attribution, observer, page;"],
    ['const files = ["scripts/probe-native-burst-attribution.mjs",',
      'const files = ["scripts/probe-complete-blink-heap.mjs", "scripts/lib/complete-blink-attribution-recipe.mjs", "scripts/lib/complete-blink-heap-summary.mjs", "scripts/probe-native-burst-attribution.mjs",'],
    ['scope: "actual-native-burst-trigger-synthetic-blank-browser-prerequisite"', 'scope: "actual-complete-blink-brief-heap-synthetic-blank-browser-prerequisite"'],
    ["-native-burst-attribution-control.json", "-complete-blink-heap-control.json"],
    ["console.log(output); console.log(JSON.stringify", "completedReport = report; completedReportPath = output;\n  console.log(output); console.log(JSON.stringify"],
  ];
  let result = source;
  for (const [before, after] of patches) result = change(result, before, after);
  let reversed = result;
  for (const [before, after] of patches) reversed = reversed.replace(after, before);
  assert.equal(reversed, source, "Only explicit control bindings/report provenance changed");
  return result;
}
