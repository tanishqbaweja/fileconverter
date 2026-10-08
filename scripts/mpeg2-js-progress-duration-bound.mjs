// New explicit launcher; do not replay the sampler whose lifetime was unbounded.
import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeBoundJsProgressLauncher } from "./lib/mpeg2-js-progress-launch-recipe.mjs";
const root = path.resolve(import.meta.dirname, "..");
const previous = makeBoundJsProgressLauncher(await readFile(path.join(root, "scripts/mpeg2-js-progress-original.mjs"), "utf8"), root);
const patches = [
  ["makeJsProgressOriginalDriver", "makeDurationBoundJsProgressOriginalDriver"],
  ['./lib/mpeg2-js-progress-recipe.mjs', './lib/mpeg2-js-progress-duration-recipe.mjs'],
  ['  "scripts/mpeg2-js-progress-original-bound.mjs",',
    '  "scripts/mpeg2-js-progress-duration-bound.mjs", "scripts/lib/mpeg2-js-progress-duration-recipe.mjs", "scripts/lib/conversion-js-allocation-duration-bound.mjs", "tests/conversion-js-allocation-duration.test.mjs", "scripts/mpeg2-js-progress-original-bound.mjs",'],
];
let generated = previous;
for (const [before, after] of patches) { assert.ok(generated.includes(before), before); generated = generated.replaceAll(before, after); }
let reversed = generated;
for (const [before, after] of patches.toReversed()) reversed = reversed.replaceAll(after, before);
assert.equal(reversed, previous, "Only bounded profiler import/provenance; full-source, settings and cleanup gates preserved");
generated = generated.replace(/^(import[^\r\n]*from) "(\.\/lib\/[^\"]+)"/gm,
  (_match, prefix, file) => `${prefix} ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", file)).href)}`);
const runtime = await createOwnedRuntimeScratch("mpeg2-js-duration-launch-");
try { const target = path.join(runtime.directory, "launcher.mjs"); await writeFile(target, generated, { flag: "wx" }); await import(pathToFileURL(target).href); }
finally { await runtime.close(); await assert.rejects(access(runtime.directory), { code: "ENOENT" }); }
