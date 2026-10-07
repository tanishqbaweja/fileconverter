import assert from "node:assert/strict";
import { access, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { makeBoundedTypeDriver } from "./lib/bounded-name-detailed-blink-recipe.mjs";
const root = path.resolve(import.meta.dirname, ".."), runtime = await createOwnedRuntimeScratch("type-schema-blink-wrapper-");
const change = (source, before, after) => { assert.equal(source.split(before).length, 2, before); return source.replace(before, after); };
try {
  const recipeUrl = pathToFileURL(path.join(root, "scripts/lib/bounded-name-detailed-blink-recipe.mjs")).href;
  const schemaUrl = pathToFileURL(path.join(root, "scripts/lib/detailed-blink-type-schema.mjs")).href;
  const oldSummaryUrl = pathToFileURL(path.join(root, "scripts/lib/bounded-detailed-blink-type-summary.mjs")).href;
  const recipeSource = `import assert from "node:assert/strict";
import { makeDetailedBlinkAttribution as helper, makeSingleDetailedBlinkControl as control } from ${JSON.stringify(recipeUrl)};
export function makeDetailedBlinkAttribution(source, root) {
  const old = helper(source, root), before = ${JSON.stringify(`from ${JSON.stringify(oldSummaryUrl)};`)}, after = ${JSON.stringify(`from ${JSON.stringify(schemaUrl)};`)};
  assert.equal(old.split(before).length, 2); return old.replace(before, after);
}
export function makeSingleDetailedBlinkControl(...args) {
  const old = control(...args), before = '"scripts/probe-bounded-detailed-blink-types.mjs",';
  assert.equal(old.split(before).length, 2);
  return old.replace(before, '"scripts/probe-detailed-blink-type-schema.mjs", "scripts/lib/detailed-blink-type-schema.mjs", "scripts/probe-bounded-detailed-blink-types.mjs",');
}
`;
  const recipe = path.join(runtime.directory, "recipe.mjs"); await writeFile(recipe, recipeSource, { flag: "wx" });
  let driver = makeBoundedTypeDriver(await readFile(path.join(root, "scripts/probe-single-detailed-blink-types.mjs"), "utf8"), root);
  const boundUrl = pathToFileURL(path.join(root, "scripts/lib/bounded-name-detailed-blink-recipe.mjs")).href;
  assert.equal(driver.split(`from ${JSON.stringify(boundUrl)};`).length, 3);
  driver = driver.replaceAll(`from ${JSON.stringify(boundUrl)};`, `from ${JSON.stringify(pathToFileURL(recipe).href)};`);
  driver = change(driver, 'const available = types.some(t => t.objectCount > 0 && t.allocatedObjectsBytes > 0);',
    'const available = report.trace?.allocatorSummary?.some(d => d.processes.some(p => p.detailedTypeSchema?.records > 0)) ?? false;');
  driver = change(driver, 'types, typeFieldsAvailable: available,', 'types, schemaFieldsInspected: available,');
  driver = change(driver, 'evidence/bounded-detailed-blink-type-control-2026-10-07.json', 'evidence/detailed-blink-type-schema-2026-10-07.json');
  driver = driver.replaceAll('completed-bounded-detailed-blink-type-control', 'completed-detailed-blink-type-schema-control')
    .replace('failed-bounded-detailed-blink-type-control', 'failed-detailed-blink-type-schema-control');
  // Keep the generated schema driver/recipe too: its unique predicate/provenance
  // is not confused with the earlier failed complete type-retention control.
  driver = change(driver, 'generatedSources: { helper: generatedHelper, control: generatedControl },',
    `generatedSources: { helper: generatedHelper, control: generatedControl, schemaDriver: await readFile(new URL(import.meta.url), "utf8"), schemaRecipe: ${JSON.stringify(recipeSource)} },`);
  driver = change(driver, 'generatedSourceHashes: { helper: sha(generatedHelper), control: sha(generatedControl) },',
    `generatedSourceHashes: { helper: sha(generatedHelper), control: sha(generatedControl), schemaDriver: sha(await readFile(new URL(import.meta.url), "utf8")), schemaRecipe: sha(${JSON.stringify(recipeSource)}) },`);
  const file = path.join(runtime.directory, "driver.mjs"); await writeFile(file, driver, { flag: "wx" });
  await import(pathToFileURL(file).href);
} finally { await runtime.close(); }
await assert.rejects(access(runtime.directory), { code: "ENOENT" }); console.log("Schema wrapper scratch removed");
