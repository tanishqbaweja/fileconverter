import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./lib/ebml-reuse-browser-components.mjs";
const root = path.resolve(import.meta.dirname, "..");
const source = await readFile(path.join(root, "scripts/analyze-warm-cache.mjs"), "utf8");
const traceStart = source.indexOf("const trace = report.rendererAttributionResult.sessions[0].trace.trace"), traceEnd = source.indexOf("const disposablePaths =", traceStart);
assert.ok(traceStart > 0 && traceEnd > traceStart);
let generated = exactPatch(source, [
  ['"evidence/2026-10-17T04-17-55-073Z-warm-cache-control-terminal.json"', '"evidence/2026-10-17T20-58-20-928Z-recovery-runtime-control-terminal.json"'],
  ['"evidence/2026-10-17T04-01-20-706Z-compiled-cache-control-terminal.json"', '"evidence/2026-10-17T18-26-10-502Z-catalogue-slot-control-terminal.json"'],
  ['import { makeCompiledCacheApp, makeCompiledCacheWorker }', 'import { makeCompiledCacheWorker }'],
  ['import { inspectWarmCacheFailure } from "./lib/warm-cache-observation.mjs";',
    'import { makeBoundedCatalogueApp as makeCompiledCacheApp } from "./lib/bounded-catalogue-candidate.mjs";\nimport { makeCatalogueSlotReuse } from "./lib/catalogue-slot-reuse.mjs";\nimport { inspectRecoveryDiscovery as inspectWarmCacheFailure } from "./lib/recovery-discovery-observation.mjs";'],
  ['import { deriveWarmCacheModule } from "./lib/warm-cache-qualification.mjs";', 'import { deriveRecoveryRuntimeModule as deriveWarmCacheModule } from "./lib/recovery-runtime-control.mjs";'],
  ['Object.keys(source.pins).length, 784', 'Object.keys(source.pins).length, 816'],
  ['assert.deepEqual(makeCompiledCacheWorker((await read("workers/conversion.worker.ts")).toString()), buildSource.workerRecipe);',
    'assert.deepEqual(makeCompiledCacheWorker((await read("workers/conversion.worker.ts")).toString()), buildSource.workerRecipe);\nassert.deepEqual(makeCatalogueSlotReuse((await read("app/converter/PublishedFormatsCatalogue.tsx")).toString()),buildSource.slotRecipe);'],
  [source.slice(traceStart, traceEnd), '// No renderer trace was started; discovery failed before execution.\n'],
  ['"scripts/analyze-warm-cache.mjs", "scripts/lib/warm-cache-observation.mjs", "tests/warm-cache-observation.test.mjs"', '"scripts/analyze-recovery-discovery.mjs", "scripts/lib/recovery-discovery-observation.mjs", "tests/recovery-discovery-observation.test.mjs"'],
  ['all784ExecutedCurrentPostPinsEqual: true', 'all816ExecutedCurrentPostPinsEqual: true'],
  ['  trace: { path: path.relative(root, tracePath).replaceAll(path.sep, "/"), bytes: traceZip.length, sha256: sha(traceZip), capturedAfterProductionCancellation: true },\n', '  // No execution or failure-only trace to audit.\n'],
  ['"evidence/2026-10-17-warm-cache-independent-analysis.json"', '"evidence/2026-10-18-recovery-discovery-independent-analysis.json"'],
  ['Do not repeat unchanged or start full original stress. Compiled reuse alone fails after write failure; diagnose retained renderer/worker/native allocation across successful-save and error retirement, with pre/post lifecycle evidence before implementing a specific fix. Post-cancel dump is not peak object/callsite proof.',
    'No execution trace was collected. Inspect actual category discovery and test event selection in a short browser-only capability probe before another full conversion sequence. Missing discovery metadata does not prove unsupported event categories.'],
  ['path.resolve(import.meta.dirname, "..")', JSON.stringify(root)],
  ['console.log(JSON.stringify({ output, completedSmallOutputs: analysis.completedSmallOutputs, firstNativeBreachMiB: analysis.firstNativeBreachMiB,\n  peakIncrementalPrivateMiB: analysis.peakIncrementalPrivateMiB, birthsChecked: births.length, originalSha256 }));',
    'console.log(JSON.stringify({output,completedSmallOutputs:analysis.completedSmallOutputs,traceStarted:analysis.traceStarted,birthsChecked:births.length,originalSha256}));'],
]).generated;
generated = generated.replaceAll(/from "(\.\/lib\/[^"\n]+)"/g, (_, relative) => `from ${JSON.stringify(pathToFileURL(path.join(root, "scripts", relative)).href)}`)
  .replace('import "./lib/reliable-readonly-preflight.mjs";', `import ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/reliable-readonly-preflight.mjs")).href)};`)
  .replace('from "esbuild"', `from ${JSON.stringify(import.meta.resolve("esbuild"))}`);
await import(`data:text/javascript;base64,${Buffer.from(generated).toString("base64")}`);
