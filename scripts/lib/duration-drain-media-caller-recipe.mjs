import path from "node:path";
import { pathToFileURL } from "node:url";
import { makePacketDrainMediaCaller } from "./packet-drain-media-caller-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makeDurationDrainMediaCaller(source, root) {
  const parent = makePacketDrainMediaCaller(source, root).generated;
  const renamed = parent.replaceAll("${stamp}-packet-drain-media", "${stamp}-duration-drain-media");
  const uri = file => pathToFileURL(path.join(root, file)).href;
  return exactPatch(parent, [
    [parent, renamed],
    [uri("scripts/lib/packet-drain-media-recipe.mjs"), uri("scripts/lib/duration-drain-media-recipe.mjs")],
    ['const newUrl=pathToFileURL(path.join(root,"scripts/lib/packet-drain-media-recipe.mjs")).href;',
      'const newUrl=pathToFileURL(path.join(root,"scripts/lib/duration-drain-media-recipe.mjs")).href;'],
    ["process.env.WITHIN_PACKET_DRAIN_CONTROL_RECEIPT", "process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT"],
    ["-packet-drain-browser-control-executed-sources", "-duration-drain-browser-control-executed-sources"],
    ['"scripts/qualify-packet-drain-media.mjs",',
      '"scripts/qualify-duration-drain-media.mjs","scripts/lib/duration-drain-media-caller-recipe.mjs","scripts/lib/duration-drain-media-recipe.mjs","scripts/lib/duration-drain-media-manifest.mjs","scripts/qualify-packet-drain-media.mjs",'],
    ['createOwnedRuntimeScratch("packet-drain-media-caller-")', 'createOwnedRuntimeScratch("duration-drain-media-caller-")'],
  ]);
}
