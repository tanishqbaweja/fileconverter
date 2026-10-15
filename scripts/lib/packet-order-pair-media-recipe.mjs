import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeMvfMediaComponents } from "./mvf-arena-media-recipe.mjs";
import { makePacketDrainMediaComponents } from "./packet-drain-media-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function packetOrderVariant() {
  const variant = process.env.WITHIN_PACKET_ORDER_VARIANT;
  assert.ok(["baseline", "candidate"].includes(variant)); return variant;
}
export function makePacketOrderMediaComponents(source, root, variant) {
  assert.ok(["baseline", "candidate"].includes(variant));
  const parent = (variant === "baseline" ? makeMvfMediaComponents : makePacketDrainMediaComponents)(source, root).generated;
  const previous = variant === "baseline" ? "mvf-arena" : "packet-drain";
  return exactPatch(parent, [
    ['import assert from "node:assert/strict";', `import assert from "node:assert/strict";\nimport { withPacketOrderProbe } from ${JSON.stringify(pathToFileURL(path.join(root, "scripts/lib/packet-order-pair-probe.mjs")).href)};`],
    ["return {...old,stage,composition:", "return {...old,spec:withPacketOrderProbe(old.spec),stage,composition:"],
    [`path.join(root,"scripts/lib/${previous}-media-recipe.mjs")`, 'path.join(root,"scripts/lib/packet-order-pair-media-recipe.mjs")'],
  ]);
}
export async function loadPacketOrderMediaComponents(root) {
  const recipe = makePacketOrderMediaComponents(await readFile(path.join(root, "scripts/lib/ebml-reuse-media-recipe.mjs"), "utf8"), root, packetOrderVariant());
  const components = await import("data:text/javascript;base64," + Buffer.from(recipe.generated).toString("base64"));
  return { ...components, recipe };
}
export const ebmlMediaParts = async root => (await loadPacketOrderMediaComponents(root)).ebmlMediaParts(root);
export const makeEbmlMediaBrowserRecipe = async (...args) => (await loadPacketOrderMediaComponents(args[1])).makeEbmlMediaBrowserRecipe(...args);
export const verifyEbmlMediaCandidate = async (root, directory) => (await loadPacketOrderMediaComponents(root)).verifyEbmlMediaCandidate(root, directory);
export const inspectEbmlMediaReport = async (...args) => (await loadPacketOrderMediaComponents(path.resolve(import.meta.dirname, "../.."))).inspectEbmlMediaReport(...args);
