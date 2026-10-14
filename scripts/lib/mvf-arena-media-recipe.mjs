// Same four production conversion/fidelity/recovery cases and plane encoder.
// Only the source-qualified decoder and its current native bindings change.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makeMvfMediaComponents(source, root) {
  assert.equal(sha(source), "58a30d256db1368edeb6cbb69181c9a0c3c5518e2d85bbe100b71c0be08b50d7");
  const originalImport = 'import { exactPatch, verifyEbmlNative, makeEbmlObservers, EBML_DECODER_SHA256, EBML_TOOL_DIRECTORY } from "./ebml-reuse-browser-components.mjs";';
  const edits = [
    [originalImport, `import { loadMvfBrowserComponents } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/mvf-arena-browser-components.mjs")).href)};
const { exactPatch, verifyEbmlNative, makeEbmlObservers, EBML_DECODER_SHA256, EBML_TOOL_DIRECTORY } = await loadMvfBrowserComponents(${JSON.stringify(root)});`],
    ["process.env.WITHIN_EBML_REUSE_CONTROL_RECEIPT", "process.env.WITHIN_MVF_ARENA_CONTROL_RECEIPT"],
    ["-ebml-reuse-browser-control-executed-sources", "-mvf-arena-browser-control-executed-sources"],
    ['"mpeg2-ebml-reuse-builder-recipe.mjs"', '"mpeg2-mvf-arena-builder-recipe.mjs"'],
    ['manifest.ebmlReuse=native.build.manifest.ebmlReuse;', `manifest.ebmlReuse=native.build.manifest.ebmlReuse;
  manifest.mvfArena=native.build.manifest.mvfArena;
  // These groups describe the actual current decoder build, not historical
  // generated-builder identities. The separate qualified plane encoder stays.
  for(const key of ["singleIdle","alignedReuse","allocationAttempt","alignment16","hevcPlanes"])
    manifest[key]=structuredClone(native.build.manifest[key]);`],
    ['path.join(root,"scripts/lib/ebml-reuse-media-recipe.mjs")', 'path.join(root,"scripts/lib/mvf-arena-media-recipe.mjs")'],
    ['ebmlMediaParts(path.resolve(import.meta.dirname,"../.."))', `ebmlMediaParts(${JSON.stringify(root)})`],
    ['manifest.ebmlReuseComposition=', 'manifest.mvfArenaComposition='],
  ];
  for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
    if (match[0] === originalImport) continue;
    edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts/lib", match[1])).href)}`)]);
  }
  return exactPatch(source, edits);
}
export async function loadMvfMediaComponents(root) {
  const recipe = makeMvfMediaComponents(await readFile(path.join(root, "scripts/lib/ebml-reuse-media-recipe.mjs"), "utf8"), root);
  const components = await import("data:text/javascript;base64," + Buffer.from(recipe.generated).toString("base64"));
  return { ...components, recipe };
}
export const ebmlMediaParts = async root => (await loadMvfMediaComponents(root)).ebmlMediaParts(root);
export const makeEbmlMediaBrowserRecipe = async (...args) => (await loadMvfMediaComponents(args[1])).makeEbmlMediaBrowserRecipe(...args);
export const verifyEbmlMediaCandidate = async (root, directory) => (await loadMvfMediaComponents(root)).verifyEbmlMediaCandidate(root, directory);
export const inspectEbmlMediaReport = async (...args) => (await loadMvfMediaComponents(path.resolve(import.meta.dirname, "../.."))).inspectEbmlMediaReport(...args);
