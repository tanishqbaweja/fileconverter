// Exact private full-original derivative. Same public pipeline and acceptance.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makeMvfFullComponents(source, root) {
  assert.equal(sha(source), "c18ea5e174f47239d8fc2e3836373d721c726d44bf9e6a10e339105a9eb40f5d");
  const renamed = source.replaceAll("ebml-reuse-full-sources.mjs", "mvf-arena-full-sources.mjs")
    .replaceAll("ebml-reuse-full-failure.mjs", "mvf-arena-full-failure.mjs")
    .replaceAll("ebml-reuse-full-recipe.mjs", "mvf-arena-full-recipe.mjs")
    .replaceAll("stage-ebml-reuse-full.mjs", "stage-mvf-arena-full.mjs")
    .replaceAll("run-ebml-reuse-full.mjs", "run-mvf-arena-full.mjs")
    .replaceAll("tests/ebml-reuse-full.test.mjs", "tests/mvf-arena-full.test.mjs")
    .replaceAll("-private-mpeg2-ebml-reuse-full", "-private-mpeg2-mvf-arena-full")
    .replaceAll("ebml-reuse-supervisor", "mvf-arena-supervisor")
    .replaceAll("-ebml-reuse-full-live.json", "-mvf-arena-full-live.json")
    .replaceAll("${stamp}-ebml-reuse-original-full", "${stamp}-mvf-arena-original-full")
    .replaceAll("|installed-chrome-realloc|ebml-reuse)-full-live", "|installed-chrome-realloc|ebml-reuse|mvf-arena)-full-live");
  const oldMediaImport = 'import { ebmlMediaParts,inspectEbmlMediaReport,verifyEbmlMediaCandidate } from "./ebml-reuse-media-recipe.mjs";';
  const edits = [[source, renamed],
    ['const defaultRoot=path.resolve(import.meta.dirname,"../..");', `const defaultRoot=${JSON.stringify(root)};`],
    [oldMediaImport, `import { ebmlMediaParts,inspectEbmlMediaReport,verifyEbmlMediaCandidate } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/mvf-arena-media-recipe.mjs")).href)};`],
    ["evidence/2026-10-14T18-18-41-950Z-ebml-reuse-media.json", "evidence/2026-10-14T22-20-42-730Z-mvf-arena-media.json"],
    ["evidence/2026-10-14T18-18-41-950Z-ebml-reuse-independent-qualification.json", "evidence/2026-10-14T22-20-42-730Z-mvf-arena-independent-qualification.json"],
    ["evidence/2026-10-14T18-18-41-941Z-ebml-reuse-media-supplement.json", "evidence/2026-10-14T22-20-42-722Z-mvf-arena-media-supplement.json"],
    ["Object.keys(supplement.sourcePins).length,18", "Object.keys(supplement.sourcePins).length,42"],
    ["sourceCount:273", "sourceCount:297"],
    ["7037563225465b6bff6f3f17eccc9a2f42033e435d3473101efb631b6736fe25", "2aa60267136b8d35116cceb5cbff5f79d0aae21c62d524ac5bacabcd02f22576"],
    ["[4475,4441,4438,4443]", "[4476,4442,4439,4444]"],
    ["work/mpeg2-ebml-reuse-38608791023/", "work/mpeg2-mvf-arena-38643550000/"],
    ["const extra=[...new Set([...parent.extraFiles,", `const priorFull=JSON.parse(await readFile(path.join(root,"evidence/2026-10-14T19-03-00-388Z-ebml-reuse-original-full-terminal.json")));
  assert.equal(Object.keys(priorFull.sourcePins).length,546);
  const extra=[...new Set([...Object.keys(priorFull.sourcePins),"scripts/lib/mvf-arena-media-recipe.mjs","scripts/lib/mvf-arena-browser-components.mjs",...parent.extraFiles,`],
  ];
  for (const match of renamed.matchAll(/^import(?:(?!;)[\s\S])*?from\s+"(\.[^"]+)"\s*;/gm)) {
    if (match[0] === oldMediaImport) continue;
    edits.push([match[0], match[0].replace(`from "${match[1]}"`, `from ${JSON.stringify(pathToFileURL(path.resolve(root, "scripts/lib", match[1])).href)}`)]);
  }
  return exactPatch(source, edits);
}
async function components(root) {
  const recipe = makeMvfFullComponents(await readFile(path.join(root, "scripts/lib/ebml-reuse-full-recipe.mjs"), "utf8"), root);
  return import("data:text/javascript;base64," + Buffer.from(recipe.generated).toString("base64"));
}
const defaultRoot = path.resolve(import.meta.dirname, "../..");
export const loadQualifiedEbmlMedia = async (root = defaultRoot) => (await components(root)).loadQualifiedEbmlMedia(root);
export const createAttemptPlaneCandidate = async (root, directory) => (await components(root)).createAttemptPlaneCandidate(root, directory);
export const verifyAttemptPlaneCandidate = async (root, directory) => (await components(root)).verifyAttemptPlaneCandidate(root, directory);
export const makeEbmlFullStager = async (root, name) => (await components(root)).makeEbmlFullStager(root, name);
export const makeEbmlFullDriver = async (root, ...args) => (await components(root)).makeEbmlFullDriver(root, ...args);
export const makeEbmlFullCaller = async (root = defaultRoot) => (await components(root)).makeEbmlFullCaller(root);
export async function makeEbmlFullSupervisor(source, root) { return (await components(root)).makeEbmlFullSupervisor(source, root); }
