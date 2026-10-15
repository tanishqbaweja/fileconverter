import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makePacketDrainBrowserControl } from "./packet-drain-control-recipe.mjs";
export function makeDurationDrainBrowserControl(source, root) {
  const parent = makePacketDrainBrowserControl(source, root).generated;
  const renamed = parent.replaceAll("packet-drain-browser-control-", "duration-drain-browser-control-")
    .replaceAll("packet-drain-control-browser-", "duration-drain-control-browser-")
    .replaceAll("${stamp}-packet-drain-browser-control", "${stamp}-duration-drain-browser-control");
  return exactPatch(parent, [
    [parent, renamed],
    [pathToFileURL(path.join(root, "scripts/lib/packet-drain-browser-components.mjs")).href,
      pathToFileURL(path.join(root, "scripts/lib/duration-drain-browser-components.mjs")).href],
    ["{ loadPacketDrainBrowserComponents }", "{ loadDurationDrainBrowserComponents }"],
    ["await loadPacketDrainBrowserComponents(", "await loadDurationDrainBrowserComponents("],
    ['"scripts/check-packet-drain-browser-control.mjs",',
      '"scripts/check-duration-drain-browser-control.mjs", "scripts/lib/duration-drain-control-recipe.mjs", "scripts/lib/duration-drain-browser-components.mjs", "scripts/check-packet-drain-browser-control.mjs",'],
    ["actualFiles: 116", "actualFiles: 126"],
    ["actual-headless-packet-drain-control-executed-not-media-acceptance", "actual-headless-duration-drain-control-executed-not-media-acceptance"],
  ]);
}
