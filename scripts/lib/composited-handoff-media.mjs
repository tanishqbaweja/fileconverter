import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeStagedHandoffMediaCaller } from "./staged-handoff-media-caller.mjs";
import { makeEbmlMediaBrowserRecipe as parentRecipe } from "./staged-handoff-media-recipe.mjs";
export { ebmlMediaParts, verifyEbmlMediaCandidate, inspectEbmlMediaReport } from "./staged-handoff-media-recipe.mjs";
export const COMPOSITED_MEDIA_FILES=["scripts/build-composited-handoff.mjs","scripts/lib/composited-handoff-recipe.mjs",
  "scripts/lib/composited-handoff-media.mjs","scripts/qualify-composited-handoff-media.mjs","tests/composited-handoff.test.mjs"];
export function makeCompositedMediaCaller(source,root) {
  const parent=makeStagedHandoffMediaCaller(source,root).generated, uri=file=>pathToFileURL(path.join(root,file)).href;
  const named=parent.replaceAll("${stamp}-staged-handoff-media","${stamp}-composited-handoff-media");
  return exactPatch(parent,[[parent,named],
    [uri("scripts/lib/staged-handoff-media-recipe.mjs"),uri("scripts/lib/composited-handoff-media.mjs")],
    ['const newUrl=pathToFileURL(path.join(root,"scripts/lib/staged-handoff-media-recipe.mjs")).href;',
      'const newUrl=pathToFileURL(path.join(root,"scripts/lib/composited-handoff-media.mjs")).href;'],
    ['"scripts/qualify-staged-handoff-media.mjs",',COMPOSITED_MEDIA_FILES.map(file=>JSON.stringify(file)).join(",")+',"scripts/qualify-staged-handoff-media.mjs",']]);
}
export async function makeEbmlMediaBrowserRecipe(...args) {
  const parent=await parentRecipe(...args), stamp=args[3];
  const driver=exactPatch(parent.driver,[["scripts/build-staged-handoff-candidate.mjs","scripts/build-composited-handoff.mjs"]]);
  return {...parent,driver:driver.generated,handoffLifecycle:{...parent.handoffLifecycle,
    buildProofPath:`evidence/${stamp}-composited-handoff-build.json`,progressCompositingPreserved:true}};
}
