// Current qualified native/stager, original full-file production acceptance.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeMvfFullComponents } from "./mvf-arena-full-recipe.mjs";
import { DURATION_PREVIOUS_FULL } from "./duration-drain-full-sources.mjs";
export function makeDurationFullComponents(source, root) {
  const parent = makeMvfFullComponents(source, root).generated;
  const renamed = parent.replaceAll("mvf-arena-full", "duration-drain-full")
    .replaceAll("mvf-arena-supervisor", "duration-drain-supervisor")
    .replaceAll("${stamp}-mvf-arena-original-full", "${stamp}-duration-drain-original-full")
    .replaceAll("|mvf-arena)-full-live", "|mvf-arena|duration-drain)-full-live");
  const uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const start = renamed.indexOf("export async function loadQualifiedEbmlMedia("), end = renamed.indexOf("export const verifyAttemptPlaneCandidate=", start);
  assert.ok(start > 0 && end > start);
  const loader = renamed.slice(start, end);
  const driverBounds = "const extensionFiles=[...new Set(files.filter(file=>!parentFiles.includes(file)))];assert.ok(extensionFiles.length<=128);";
  const additions = `const previousFull=JSON.parse(await readFile(path.join(root,${JSON.stringify(DURATION_PREVIOUS_FULL)})));
  assert.equal(Object.keys(previousFull.sourcePins).length,588);
  const oldExtension=Object.keys(previousFull.sourcePins).filter(file=>!parentFiles.includes(file));assert.equal(oldExtension.length,80);assert.ok(oldExtension.length<=128);
  for(const file of Object.keys(previousFull.sourcePins))assert.ok(files.includes(file),"Retain executed588 parent: "+file);
  const durationExtension=files.filter(file=>!Object.hasOwn(previousFull.sourcePins,file));assert.ok(durationExtension.length<=128);
  const extensionFiles=[...new Set([...oldExtension,...durationExtension])];`;
  return exactPatch(parent, [
    [parent, renamed],
    [uri("mvf-arena-media-recipe.mjs"), uri("duration-drain-media-recipe.mjs")],
    [loader, `import { loadQualifiedDurationMedia as loadQualifiedEbmlMedia } from ${JSON.stringify(uri("duration-drain-full-media.mjs"))};\nexport { loadQualifiedEbmlMedia };\n`],
    ["work/mpeg2-mvf-arena-38643550000/", "work/mpeg2-duration-drain-38678806473/"],
    [driverBounds, additions],
    ["const extensionSourceFiles=${JSON.stringify(extensionFiles)};assert.ok(extensionSourceFiles.length<=128);",
      "const previousExtensionSourceFiles=${JSON.stringify(oldExtension)};assert.equal(previousExtensionSourceFiles.length,80);assert.ok(previousExtensionSourceFiles.length<=128);\\nconst durationExtensionSourceFiles=${JSON.stringify(durationExtension)};assert.ok(durationExtensionSourceFiles.length<=128);\\nconst extensionSourceFiles=[...previousExtensionSourceFiles,...durationExtensionSourceFiles];"],
    ["const extra=[...new Set([...Object.keys(priorFull.sourcePins),", `const durationPrevious=JSON.parse(await readFile(path.join(root,${JSON.stringify(DURATION_PREVIOUS_FULL)})));assert.equal(Object.keys(durationPrevious.sourcePins).length,588);
  const extra=[...new Set([...Object.keys(durationPrevious.sourcePins),${JSON.stringify(DURATION_PREVIOUS_FULL)},durationPrevious.sourceArchive.path,...qualified.additionalEvidence,"scripts/lib/duration-drain-full-media.mjs",...Object.keys(priorFull.sourcePins),`],
    ["historicalFilesRetained:256,parentFilesRetained:508,parentLegacyFilesRetained:380,parentSupplementalFilesRetained:128,extensionFiles:snapshot.extensionFiles.length,omittedLegacyFiles:0",
      "historicalFilesRetained:256,parentFilesRetained:588,parentLegacyFilesRetained:380,parentSupplementalFilesRetained:128,parentExtensionFilesRetained:80,extensionFiles:snapshot.extensionFiles.length,omittedLegacyFiles:0"],
  ]);
}
async function components(root) {
  const recipe = makeDurationFullComponents(await readFile(path.join(root, "scripts/lib/ebml-reuse-full-recipe.mjs"), "utf8"), root);
  return import("data:text/javascript;base64," + Buffer.from(recipe.generated).toString("base64"));
}
const defaultRoot = path.resolve(import.meta.dirname, "../..");
export const loadQualifiedEbmlMedia = async (root = defaultRoot) => (await components(root)).loadQualifiedEbmlMedia(root);
export const createAttemptPlaneCandidate = async (root, directory) => (await components(root)).createAttemptPlaneCandidate(root, directory);
export const verifyAttemptPlaneCandidate = async (root, directory) => (await components(root)).verifyAttemptPlaneCandidate(root, directory);
export const makeEbmlFullStager = async (root, name) => (await components(root)).makeEbmlFullStager(root, name);
export const makeEbmlFullDriver = async (root, ...args) => (await components(root)).makeEbmlFullDriver(root, ...args);
export const makeEbmlFullCaller = async (root = defaultRoot) => (await components(root)).makeEbmlFullCaller(root);
export const makeEbmlFullSupervisor = async (source, root) => (await components(root)).makeEbmlFullSupervisor(source, root);
