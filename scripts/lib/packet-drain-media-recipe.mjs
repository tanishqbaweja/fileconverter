// Same production media tests and validator thresholds; queue-only decoder delta.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeMvfMediaComponents } from "./mvf-arena-media-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makePacketDrainMediaComponents(source, root) {
  const parent = makeMvfMediaComponents(source, root).generated;
  const uri = file => pathToFileURL(path.join(root, file)).href;
  return exactPatch(parent, [
    ['import assert from "node:assert/strict";', `import assert from "node:assert/strict";\nimport { verifyPacketDrainCache } from ${JSON.stringify(uri("scripts/lib/packet-drain-media-manifest.mjs"))};`],
    [uri("scripts/lib/mvf-arena-browser-components.mjs"), uri("scripts/lib/packet-drain-browser-components.mjs")],
    ["{ loadMvfBrowserComponents }", "{ loadPacketDrainBrowserComponents }"],
    ["await loadMvfBrowserComponents(", "await loadPacketDrainBrowserComponents("],
    ["process.env.WITHIN_MVF_ARENA_CONTROL_RECEIPT", "process.env.WITHIN_PACKET_DRAIN_CONTROL_RECEIPT"],
    ["-mvf-arena-browser-control-executed-sources", "-packet-drain-browser-control-executed-sources"],
    ['"mpeg2-mvf-arena-builder-recipe.mjs"', '"mpeg2-packet-drain-builder-recipe.mjs"'],
    ["return {native,observers,controlPath,", 'return {packetDrainKernelSource:(await read("media/ffmpeg/mpeg2-candidate.c")).toString(),native,observers,controlPath,'],
    ["assert.deepEqual(cache,native.build.manifest.packetCache);manifest.packetCache=cache;",
      "manifest.packetCache=verifyPacketDrainCache(cache,native.build.manifest.packetCache,parts.packetDrainKernelSource);"],
    ["manifest.mvfArena=native.build.manifest.mvfArena;", `manifest.mvfArena=native.build.manifest.mvfArena;
  manifest.packetDrain=structuredClone(native.build.manifest.packetDrain);
  manifest.packetInterleaveOwnership=structuredClone(native.build.manifest.packetInterleaveOwnership);`],
    ['path.join(root,"scripts/lib/mvf-arena-media-recipe.mjs")', 'path.join(root,"scripts/lib/packet-drain-media-recipe.mjs")'],
    ["manifest.mvfArenaComposition=", "manifest.packetDrainComposition="],
  ]);
}
export async function loadPacketDrainMediaComponents(root) {
  const recipe = makePacketDrainMediaComponents(await readFile(path.join(root, "scripts/lib/ebml-reuse-media-recipe.mjs"), "utf8"), root);
  const components = await import("data:text/javascript;base64," + Buffer.from(recipe.generated).toString("base64"));
  return { ...components, recipe };
}
export const ebmlMediaParts = async root => (await loadPacketDrainMediaComponents(root)).ebmlMediaParts(root);
export const makeEbmlMediaBrowserRecipe = async (...args) => (await loadPacketDrainMediaComponents(args[1])).makeEbmlMediaBrowserRecipe(...args);
export const verifyEbmlMediaCandidate = async (root, directory) => (await loadPacketDrainMediaComponents(root)).verifyEbmlMediaCandidate(root, directory);
export const inspectEbmlMediaReport = async (...args) => (await loadPacketDrainMediaComponents(path.resolve(import.meta.dirname, "../.."))).inspectEbmlMediaReport(...args);
