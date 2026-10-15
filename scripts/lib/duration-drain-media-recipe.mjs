import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makePacketDrainMediaComponents } from "./packet-drain-media-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makeDurationDrainMediaComponents(source, root) {
  const parent = makePacketDrainMediaComponents(source, root).generated;
  const uri = file => pathToFileURL(path.join(root, file)).href;
  return exactPatch(parent, [
    [`import { verifyPacketDrainCache } from ${JSON.stringify(uri("scripts/lib/packet-drain-media-manifest.mjs"))};`,
      `import { verifyDurationDrainCache as verifyPacketDrainCache } from ${JSON.stringify(uri("scripts/lib/duration-drain-media-manifest.mjs"))};\nimport { withPacketOrderProbe } from ${JSON.stringify(uri("scripts/lib/packet-order-pair-probe.mjs"))};`],
    [uri("scripts/lib/packet-drain-browser-components.mjs"), uri("scripts/lib/duration-drain-browser-components.mjs")],
    ["{ loadPacketDrainBrowserComponents }", "{ loadDurationDrainBrowserComponents }"],
    ["await loadPacketDrainBrowserComponents(", "await loadDurationDrainBrowserComponents("],
    ["process.env.WITHIN_PACKET_DRAIN_CONTROL_RECEIPT", "process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT"],
    ["-packet-drain-browser-control-executed-sources", "-duration-drain-browser-control-executed-sources"],
    ['"mpeg2-packet-drain-builder-recipe.mjs"', '"mpeg2-duration-drain-builder-recipe.mjs"'],
    ["manifest.packetDrain=structuredClone(native.build.manifest.packetDrain);", "manifest.packetDrain=structuredClone(native.build.manifest.packetDrain);\n  manifest.packetDurationBoundary=structuredClone(native.build.manifest.packetDurationBoundary);"],
    ['path.join(root,"scripts/lib/packet-drain-media-recipe.mjs")', 'path.join(root,"scripts/lib/duration-drain-media-recipe.mjs")'],
    ["manifest.packetDrainComposition=", "manifest.durationDrainComposition="],
    ["return {...old,stage,composition:", "return {...old,spec:withPacketOrderProbe(old.spec),stage,composition:"],
  ]);
}
export async function loadDurationDrainMediaComponents(root) {
  const recipe = makeDurationDrainMediaComponents(await readFile(path.join(root, "scripts/lib/ebml-reuse-media-recipe.mjs"), "utf8"), root);
  const components = await import("data:text/javascript;base64," + Buffer.from(recipe.generated).toString("base64"));
  return { ...components, recipe };
}
export const ebmlMediaParts = async root => (await loadDurationDrainMediaComponents(root)).ebmlMediaParts(root);
export const makeEbmlMediaBrowserRecipe = async (...args) => (await loadDurationDrainMediaComponents(args[1])).makeEbmlMediaBrowserRecipe(...args);
export const verifyEbmlMediaCandidate = async (root, directory) => (await loadDurationDrainMediaComponents(root)).verifyEbmlMediaCandidate(root, directory);
export const inspectEbmlMediaReport = async (...args) => (await loadDurationDrainMediaComponents(path.resolve(import.meta.dirname, "../.."))).inspectEbmlMediaReport(...args);
