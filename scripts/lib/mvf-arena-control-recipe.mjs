import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makeMvfBrowserControl(source, root) {
  const originalImport = 'import { exactPatch, verifyEbmlNative, makeEbmlObservers, EBML_DECODER_SHA256, EBML_TOOL_DIRECTORY } from "./lib/ebml-reuse-browser-components.mjs";';
  const originalFactory = `const baseFactorySource = absoluteImports(exactPatch(parentSource, [
    ['from "./realloc-attempt-abort-capture.mjs"',`;
  const factory = `const baseFactorySource = absoluteImports(exactPatch(parentSource, [
    ["loaded.runtimeSlotAddress,1918912", "loaded.runtimeSlotAddress," + native.proof.layout.within_realloc_attempt_words.address],
    ['from "./realloc-attempt-abort-capture.mjs"',`;
  const originalComposite = `const compositeFactorySource = absoluteImports(exactPatch(compositeSource, [
    ['from "./realloc-control-browser-recipe.mjs"',`;
  const composite = `const compositeFactorySource = absoluteImports(exactPatch(compositeSource, [
    ["actualAttemptSlotAddress,1918848", "actualAttemptSlotAddress," + native.proof.layout.within_allocator_attempt_words.address],
    ["actualPoolSlotAddress,1918976", "actualPoolSlotAddress," + native.proof.layout.within_refstruct_abort_words.address],
    ['from "./realloc-control-browser-recipe.mjs"',`;
  const edits = [
    [originalImport, `import { loadMvfBrowserComponents } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/mvf-arena-browser-components.mjs")).href)};
const { exactPatch, verifyEbmlNative, makeEbmlObservers, EBML_DECODER_SHA256, EBML_TOOL_DIRECTORY, recipe: componentsRecipe } = await loadMvfBrowserComponents(${JSON.stringify(root)});`],
    ['root = path.resolve(import.meta.dirname, "..")', `root = ${JSON.stringify(root)}`],
    [originalFactory, factory], [originalComposite, composite],
    ['"scripts/check-ebml-reuse-browser-control.mjs", "scripts/lib/ebml-reuse-browser-components.mjs",',
      '"scripts/check-mvf-arena-browser-control.mjs", "scripts/lib/mvf-arena-control-recipe.mjs", "scripts/lib/mvf-arena-browser-components.mjs", "scripts/check-ebml-reuse-browser-control.mjs", "scripts/lib/ebml-reuse-browser-components.mjs",'],
    ["JSON.stringify({ recipe, observers, exportRecipe, factorySource, baseFactorySource, compositeFactorySource, sourcePins, preimages })",
      'JSON.stringify({ recipe, componentsRecipe, executedCallerSource: await readFile(new URL(import.meta.url), "utf8"), observers, exportRecipe, factorySource, baseFactorySource, compositeFactorySource, sourcePins, preimages })'],
    ["actualFiles: 93", "actualFiles: 99"],
  ];
  // All browser/caller/report namespace changes are reversible as one exact edit.
  const renamed = source.replaceAll("ebml-reuse-browser-control-", "mvf-arena-browser-control-")
    .replaceAll("ebml-reuse-control-browser-", "mvf-arena-control-browser-")
    .replaceAll("${stamp}-ebml-reuse-browser-control", "${stamp}-mvf-arena-browser-control")
    .replaceAll("actual-headless-ebml-reuse-control-executed-not-media-acceptance", "actual-headless-mvf-arena-control-executed-not-media-acceptance");
  assert.notEqual(renamed, source); edits.unshift([source, renamed]);
  // Imports below apply to the renamed parent; no generated browser process yet.
  for (const match of renamed.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
    if (match[0] === originalImport) continue;
    edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts", match[1])).href)}`)]);
  }
  // The first edit intentionally matches the entire parent; all other edits are
  // anchored within its result and the full sequence still reverses byte-exact.
  return exactPatch(source, edits);
}
