import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeMvfMediaCaller } from "./mvf-arena-media-caller-recipe.mjs";
import { makePacketDrainMediaCaller } from "./packet-drain-media-caller-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makePacketOrderMediaCaller(source, root, variant) {
  assert.ok(["baseline", "candidate"].includes(variant));
  const parent = (variant === "baseline" ? makeMvfMediaCaller : makePacketDrainMediaCaller)(source, root).generated;
  const previous = variant === "baseline" ? "mvf-arena" : "packet-drain";
  const renamed = parent.replaceAll("${stamp}-" + previous + "-media", "${stamp}-packet-order-" + variant + "-media");
  return exactPatch(parent, [
    [parent, renamed],
    [pathToFileURL(path.join(root, `scripts/lib/${previous}-media-recipe.mjs`)).href,
      pathToFileURL(path.join(root, "scripts/lib/packet-order-pair-media-recipe.mjs")).href],
    [`const newUrl=pathToFileURL(path.join(root,"scripts/lib/${previous}-media-recipe.mjs")).href;`,
      'const newUrl=pathToFileURL(path.join(root,"scripts/lib/packet-order-pair-media-recipe.mjs")).href;'],
    [`"scripts/qualify-${previous}-media.mjs",`,
      `"scripts/qualify-packet-order-pair.mjs","scripts/lib/packet-order-pair-caller-recipe.mjs","scripts/lib/packet-order-pair-media-recipe.mjs","scripts/lib/packet-order-pair-probe.mjs","scripts/qualify-${previous}-media.mjs",`],
    [`createOwnedRuntimeScratch("${previous}-media-caller-")`, `createOwnedRuntimeScratch("packet-order-${variant}-media-caller-")`],
  ]);
}
