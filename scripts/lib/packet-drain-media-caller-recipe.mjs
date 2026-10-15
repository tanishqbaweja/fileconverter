import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeMvfMediaCaller } from "./mvf-arena-media-caller-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makePacketDrainMediaCaller(source, root) {
  const parent = makeMvfMediaCaller(source, root).generated;
  const renamed = parent.replaceAll("${stamp}-mvf-arena-media", "${stamp}-packet-drain-media");
  const uri = file => pathToFileURL(path.join(root, file)).href;
  return exactPatch(parent, [
    [parent, renamed],
    [uri("scripts/lib/mvf-arena-media-recipe.mjs"), uri("scripts/lib/packet-drain-media-recipe.mjs")],
    ['const newUrl=pathToFileURL(path.join(root,"scripts/lib/mvf-arena-media-recipe.mjs")).href;',
      'const newUrl=pathToFileURL(path.join(root,"scripts/lib/packet-drain-media-recipe.mjs")).href;'],
    ["process.env.WITHIN_MVF_ARENA_CONTROL_RECEIPT", "process.env.WITHIN_PACKET_DRAIN_CONTROL_RECEIPT"],
    ["-mvf-arena-browser-control-executed-sources", "-packet-drain-browser-control-executed-sources"],
    ['"scripts/qualify-mvf-arena-media.mjs",',
      '"scripts/qualify-packet-drain-media.mjs","scripts/lib/packet-drain-media-caller-recipe.mjs","scripts/lib/packet-drain-media-recipe.mjs","scripts/lib/packet-drain-media-manifest.mjs","scripts/qualify-mvf-arena-media.mjs",'],
    ['createOwnedRuntimeScratch("mvf-arena-media-caller-")', 'createOwnedRuntimeScratch("packet-drain-media-caller-")'],
  ]);
}
