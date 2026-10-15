import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeDurationDrainMediaCaller } from "./duration-drain-media-caller-recipe.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { HANDOFF_MEDIA_FILES } from "./staged-handoff-media-recipe.mjs";
export function makeStagedHandoffMediaCaller(source, root) {
  const parent = makeDurationDrainMediaCaller(source, root).generated;
  const renamed = parent.replaceAll("${stamp}-duration-drain-media", "${stamp}-staged-handoff-media");
  const uri = file => pathToFileURL(path.join(root, file)).href;
  return exactPatch(parent, [
    [parent, renamed],
    [uri("scripts/lib/duration-drain-media-recipe.mjs"), uri("scripts/lib/staged-handoff-media-recipe.mjs")],
    ['const newUrl=pathToFileURL(path.join(root,"scripts/lib/duration-drain-media-recipe.mjs")).href;',
      'const newUrl=pathToFileURL(path.join(root,"scripts/lib/staged-handoff-media-recipe.mjs")).href;'],
    ['"scripts/qualify-duration-drain-media.mjs",', HANDOFF_MEDIA_FILES.map(file => JSON.stringify(file)).join(",") + ',"scripts/qualify-duration-drain-media.mjs",'],
    ['createOwnedRuntimeScratch("duration-drain-media-caller-")', 'createOwnedRuntimeScratch("staged-handoff-media-caller-")'],
  ]);
}
