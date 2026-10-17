// Reuse the strict archival/cleanup audit without editing its frozen source.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./lib/ebml-reuse-browser-components.mjs";
const root = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(root, "scripts/analyze-warm-cache.mjs"), "utf8");
let generated = exactPatch(source, [
  ['"evidence/2026-10-17T04-17-55-073Z-warm-cache-control-terminal.json"', '"evidence/2026-10-17T17-02-11-744Z-memoized-cache-control-terminal.json"'],
  ['"evidence/2026-10-17T04-01-20-706Z-compiled-cache-control-terminal.json"', '"evidence/2026-10-17T04-17-55-073Z-warm-cache-control-terminal.json"'],
  ['import { makeCompiledCacheApp, makeCompiledCacheWorker }', 'import { makeCompiledCacheWorker }'],
  ['import { inspectWarmCacheFailure } from "./lib/warm-cache-observation.mjs";',
    'import { makeMemoizedCacheApp as makeCompiledCacheApp } from "./lib/memoized-cache-candidate.mjs";\nimport { inspectMemoizedCacheFailure as inspectWarmCacheFailure } from "./lib/memoized-cache-observation.mjs";'],
  ['Object.keys(source.pins).length, 784', 'Object.keys(source.pins).length, 791'],
  ['"scripts/analyze-warm-cache.mjs", "scripts/lib/warm-cache-observation.mjs", "tests/warm-cache-observation.test.mjs"',
    '"scripts/analyze-memoized-cache.mjs", "scripts/lib/memoized-cache-observation.mjs", "tests/memoized-cache-observation.test.mjs"'],
  ['all784ExecutedCurrentPostPinsEqual: true', 'all791ExecutedCurrentPostPinsEqual: true'],
  ['Do not repeat unchanged or start full original stress. Compiled reuse alone fails after write failure; diagnose retained renderer/worker/native allocation across successful-save and error retirement, with pre/post lifecycle evidence before implementing a specific fix. Post-cancel dump is not peak object/callsite proof.',
    'Do not repeat unchanged or start full original stress. Compiled reuse plus display-tree memoization still fails after write failure. Investigate bounded searchable/paginated catalogue DOM preserving all published routes; post-cancel dump does not prove the allocation callsite. Preparation archive predates removal of one unused import; only the actual executed archive is asserted current.'],
  ['"evidence/2026-10-17-warm-cache-independent-analysis.json"', '"evidence/2026-10-17-memoized-cache-independent-analysis.json"'],
  ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
]).generated;
generated = generated.replaceAll(/from "(\.\/lib\/[^"\n]+)"/g,
  (_, relative) => `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts", relative)).href)}`)
  .replace('import "./lib/reliable-readonly-preflight.mjs";', `import ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/reliable-readonly-preflight.mjs")).href)};`);
generated = generated.replace('from "esbuild"', `from ${JSON.stringify(import.meta.resolve("esbuild"))}`);
assert.ok(!generated.includes('from "./lib/'));
await import(`data:text/javascript;base64,${Buffer.from(generated).toString("base64")}`);
