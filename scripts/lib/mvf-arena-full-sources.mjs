// Preserve every previously executed546 path inside the existing508+128 caps.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { materializeLayeredFullSourceArchive as materializePrevious } from "./ebml-reuse-full-sources.mjs";
export { loadHistoricalFullSourceBase } from "./ebml-reuse-full-sources.mjs";
export const MVF_PREVIOUS_FULL = "evidence/2026-10-14T19-03-00-388Z-ebml-reuse-original-full-terminal.json";
export function makeMvfFullSources(source, root) {
  assert.equal(sha(source), "3d638c6e77a905efae0deafceaa41a4253f1f7dd67843218b852d45d35ed4ed8");
  const edits = [
    ["${stamp}-ebml-reuse-full-executed-sources", "${stamp}-mvf-arena-full-executed-sources"],
    ['import { readFile,writeFile } from "node:fs/promises";', 'import { readFile,writeFile,stat } from "node:fs/promises";'],
    ["  const extensionPins={},extensionPreimages={};let externalCount=0;", `  // Same16 external/2MiB envelope caps; embed every smaller remaining preimage.
  const eligible=[];
  for(const file of extensionFiles) {
    const bytes=(await stat(path.join(root,file))).size;assert.ok(bytes<=2097152);
    if((file.startsWith("evidence/")||file.startsWith("outputs/reports/"))&&bytes>=50000)eligible.push({file,bytes});
  }
  eligible.sort((a,b)=>b.bytes-a.bytes||(a.file<b.file?-1:a.file>b.file?1:0));
  const externalSelection=new Set(eligible.slice(0,16).map(row=>row.file));
  const extensionPins={},extensionPreimages={};let externalCount=0;`],
    ['if((file.startsWith("evidence/")||file.startsWith("outputs/reports/"))&&bytes.length>=50000) {', 'if(externalSelection.has(file)) {'],
  ];
  for (const match of source.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm))
    edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts/lib", match[1])).href)}`)]);
  return exactPatch(source, edits);
}
async function components(root) {
  const recipe = makeMvfFullSources(await readFile(path.join(root, "scripts/lib/ebml-reuse-full-sources.mjs"), "utf8"), root);
  return import("data:text/javascript;base64," + Buffer.from(recipe.generated).toString("base64"));
}
export async function captureLayeredFullSourcePins(root, requestedFiles) {
  const previous = JSON.parse(await readFile(path.join(root, MVF_PREVIOUS_FULL)));
  assert.equal(Object.keys(previous.sourcePins).length, 546); assert.deepEqual(previous.sourcePins, previous.postSourcePins);
  const archive = await materializePrevious(root, previous.sourceArchive);
  assert.deepEqual(archive.sourcePins, previous.sourcePins);
  for (const [file, hash] of Object.entries(previous.sourcePins)) {
    assert.equal(sha(await readFile(path.join(root, file))), hash, file);
    assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data, "base64")), hash, file);
  }
  return (await components(root)).captureLayeredFullSourcePins(root, [...Object.keys(previous.sourcePins), ...requestedFiles]);
}
export const writeLayeredFullSourceArchive = async (root, ...args) => (await components(root)).writeLayeredFullSourceArchive(root, ...args);
export const materializeLayeredFullSourceArchive = async (root, record) => (await components(root)).materializeLayeredFullSourceArchive(root, record);
