import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./lib/ebml-reuse-browser-components.mjs";
const root = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(root, "scripts/analyze-warm-cache.mjs"), "utf8");
let generated = exactPatch(source, [
  ['"evidence/2026-10-17T04-17-55-073Z-warm-cache-control-terminal.json"', '"evidence/2026-10-17T18-26-10-502Z-catalogue-slot-control-terminal.json"'],
  ['"evidence/2026-10-17T04-01-20-706Z-compiled-cache-control-terminal.json"', '"evidence/2026-10-17T17-02-11-744Z-memoized-cache-control-terminal.json"'],
  ['import { makeCompiledCacheApp, makeCompiledCacheWorker }', 'import { makeCompiledCacheWorker }'],
  ['import { inspectWarmCacheFailure } from "./lib/warm-cache-observation.mjs";',
    'import { makeBoundedCatalogueApp as makeCompiledCacheApp } from "./lib/bounded-catalogue-candidate.mjs";\nimport { makeCatalogueSlotReuse } from "./lib/catalogue-slot-reuse.mjs";\nimport { inspectCatalogueSlotFailure as inspectWarmCacheFailure } from "./lib/catalogue-slot-observation.mjs";'],
  ['Object.keys(source.pins).length, 784', 'Object.keys(source.pins).length, 811'],
  ['assert.deepEqual(makeCompiledCacheWorker((await read("workers/conversion.worker.ts")).toString()), buildSource.workerRecipe);',
    'assert.deepEqual(makeCompiledCacheWorker((await read("workers/conversion.worker.ts")).toString()), buildSource.workerRecipe);\nassert.deepEqual(makeCatalogueSlotReuse((await read("app/converter/PublishedFormatsCatalogue.tsx")).toString()),buildSource.slotRecipe);'],
  ['"scripts/analyze-warm-cache.mjs", "scripts/lib/warm-cache-observation.mjs", "tests/warm-cache-observation.test.mjs"',
    '"scripts/analyze-catalogue-slot.mjs", "scripts/lib/catalogue-slot-observation.mjs", "tests/catalogue-slot-observation.test.mjs"'],
  ['all784ExecutedCurrentPostPinsEqual: true', 'all811ExecutedCurrentPostPinsEqual: true'],
  ['Do not repeat unchanged or start full original stress. Compiled reuse alone fails after write failure; diagnose retained renderer/worker/native allocation across successful-save and error retirement, with pre/post lifecycle evidence before implementing a specific fix. Post-cancel dump is not peak object/callsite proof.',
    'Slot reuse is UI-qualified but still fails recovery memory. Do not repeat UI/cache/CSS/full original unchanged. Target bounded worker/V8/Wasm execution or compilation evidence at the repeated recovery input2162688/output748166 checkpoint; no active allocation callsite is proven by idle renderer/GPU snapshots.'],
  ['"evidence/2026-10-17-warm-cache-independent-analysis.json"', '"evidence/2026-10-17-catalogue-slot-independent-analysis.json"'],
  ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
]).generated;
generated = generated.replaceAll(/from "(\.\/lib\/[^"\n]+)"/g, (_, relative) => `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts", relative)).href)}`)
  .replace('import "./lib/reliable-readonly-preflight.mjs";', `import ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/reliable-readonly-preflight.mjs")).href)};`)
  .replace('from "esbuild"', `from ${JSON.stringify(import.meta.resolve("esbuild"))}`);
assert.ok(!generated.includes('from "./lib/'));
await import(`data:text/javascript;base64,${Buffer.from(generated).toString("base64")}`);
