import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeMvfBrowserControl } from "./mvf-arena-control-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
export function makePacketDrainBrowserControl(source, root) {
  const parent = makeMvfBrowserControl(source, root).generated;
  const renamed = parent.replaceAll("mvf-arena-browser-control-", "packet-drain-browser-control-")
    .replaceAll("mvf-arena-control-browser-", "packet-drain-control-browser-")
    .replaceAll("${stamp}-mvf-arena-browser-control", "${stamp}-packet-drain-browser-control");
  return exactPatch(parent, [
    [parent, renamed],
    [pathToFileURL(path.join(root, "scripts/lib/mvf-arena-browser-components.mjs")).href,
      pathToFileURL(path.join(root, "scripts/lib/packet-drain-browser-components.mjs")).href],
    ["{ loadMvfBrowserComponents }", "{ loadPacketDrainBrowserComponents }"],
    ["await loadMvfBrowserComponents(", "await loadPacketDrainBrowserComponents("],
    ['"scripts/check-mvf-arena-browser-control.mjs",',
      '"scripts/check-packet-drain-browser-control.mjs", "scripts/lib/packet-drain-control-recipe.mjs", "scripts/lib/packet-drain-browser-components.mjs", "scripts/check-mvf-arena-browser-control.mjs",'],
    ["actualFiles: 99", "actualFiles: 116"],
    ["actual-headless-mvf-arena-control-executed-not-media-acceptance", "actual-headless-packet-drain-control-executed-not-media-acceptance"],
  ]);
}
