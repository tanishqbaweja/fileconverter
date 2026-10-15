import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeCompositedMediaCaller,makeEbmlMediaBrowserRecipe as parentRecipe } from "./composited-handoff-media.mjs";
export { ebmlMediaParts,verifyEbmlMediaCandidate,inspectEbmlMediaReport } from "./composited-handoff-media.mjs";
export const RELIABLE_MEDIA_FILES=["scripts/lib/reliable-owned-identity.mjs","scripts/lib/reliable-composited-media.mjs",
  "scripts/qualify-reliable-composited-media.mjs","tests/reliable-owned-identity.test.mjs"];
export function makeReliableCompositedCaller(source,root) {
  const parent=makeCompositedMediaCaller(source,root).generated,uri=file=>pathToFileURL(path.join(root,file)).href;
  return exactPatch(parent,[[uri("scripts/lib/composited-handoff-media.mjs"),uri("scripts/lib/reliable-composited-media.mjs")],
    ['const newUrl=pathToFileURL(path.join(root,"scripts/lib/composited-handoff-media.mjs")).href;',
      'const newUrl=pathToFileURL(path.join(root,"scripts/lib/reliable-composited-media.mjs")).href;'],
    ['"scripts/qualify-composited-handoff-media.mjs",',RELIABLE_MEDIA_FILES.map(file=>JSON.stringify(file)).join(",")+',"scripts/qualify-composited-handoff-media.mjs",']]);
}
export async function makeEbmlMediaBrowserRecipe(...args) {
  const parent=await parentRecipe(...args),root=args[1],uri=file=>pathToFileURL(path.join(root,file)).href;
  const driver=exactPatch(parent.driver,[[`import { queryProcessIdentity, observeOwnedProcessExit } from ${JSON.stringify(uri("scripts/lib/owned-process-exit-observation.mjs"))};`,
    `import { observeOwnedProcessExit } from ${JSON.stringify(uri("scripts/lib/owned-process-exit-observation.mjs"))};\nimport { queryReliableProcessIdentity as queryProcessIdentity } from ${JSON.stringify(uri("scripts/lib/reliable-owned-identity.mjs"))};`]]);
  return {...parent,driver:driver.generated,launchIdentityQuery:{maximumAttempts:3,timeoutMsPerQuery:15000,failedQueryIsNotAbsence:true}};
}
