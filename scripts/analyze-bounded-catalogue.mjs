import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./lib/ebml-reuse-browser-components.mjs";
const root = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(root, "scripts/analyze-warm-cache.mjs"), "utf8");
let generated = exactPatch(source, [
  ['"evidence/2026-10-17T04-17-55-073Z-warm-cache-control-terminal.json"', '"evidence/2026-10-17T17-37-32-521Z-bounded-catalogue-control-terminal.json"'],
  ['"evidence/2026-10-17T04-01-20-706Z-compiled-cache-control-terminal.json"', '"evidence/2026-10-17T17-02-11-744Z-memoized-cache-control-terminal.json"'],
  ['import { makeCompiledCacheApp, makeCompiledCacheWorker }', 'import { makeCompiledCacheWorker }'],
  ['import { inspectWarmCacheFailure } from "./lib/warm-cache-observation.mjs";',
    'import { makeBoundedCatalogueApp as makeCompiledCacheApp } from "./lib/bounded-catalogue-candidate.mjs";\nimport { inspectBoundedCatalogueFailure as inspectWarmCacheFailure } from "./lib/bounded-catalogue-observation.mjs";'],
  ['Object.keys(source.pins).length, 784', 'Object.keys(source.pins).length, 803'],
  ['"scripts/analyze-warm-cache.mjs", "scripts/lib/warm-cache-observation.mjs", "tests/warm-cache-observation.test.mjs"',
    '"scripts/analyze-bounded-catalogue.mjs", "scripts/lib/bounded-catalogue-observation.mjs", "tests/bounded-catalogue-observation.test.mjs"'],
  ['all784ExecutedCurrentPostPinsEqual: true', 'all803ExecutedCurrentPostPinsEqual: true'],
  ['Do not repeat unchanged or start full original stress. Compiled reuse alone fails after write failure; diagnose retained renderer/worker/native allocation across successful-save and error retirement, with pre/post lifecycle evidence before implementing a specific fix. Post-cancel dump is not peak object/callsite proof.',
    'Do not repeat unchanged or start full original stress. All405 catalogue routes and bounded DOM pass but first conversion fails. Attribute GPU and renderer private-memory changes during catalogue traversal versus loaded idle before another candidate; do not infer causal allocation from a cross-session comparison or post-cancel dump.'],
  ['"evidence/2026-10-17-warm-cache-independent-analysis.json"', '"evidence/2026-10-17-bounded-catalogue-independent-analysis.json"'],
  ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
]).generated;
generated = generated.replaceAll(/from "(\.\/lib\/[^"\n]+)"/g,
  (_, relative) => `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts", relative)).href)}`)
  .replace('import "./lib/reliable-readonly-preflight.mjs";', `import ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/reliable-readonly-preflight.mjs")).href)};`)
  .replace('from "esbuild"', `from ${JSON.stringify(import.meta.resolve("esbuild"))}`);
assert.ok(!generated.includes('from "./lib/'));
await import(`data:text/javascript;base64,${Buffer.from(generated).toString("base64")}`);
