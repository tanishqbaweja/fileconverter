// Preserve the actual750-source failed full session; add one bounded layer.
import {readFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";
import {exactPatch} from "./ebml-reuse-browser-components.mjs";
export function deriveRecordedTimelineSourceLayer(source,root) {
  const uri=file=>pathToFileURL(path.join(root,"scripts/lib",file)).href;
  const relocated=source.replace(/from "(\.[^"\r\n]+)"/g,(_,file)=>`from ${JSON.stringify(pathToFileURL(path.resolve(root,"scripts/lib",file)).href)}`);
  const named=relocated.replaceAll("726","750").replaceAll("interruptedNotAccepted","validationFailedNotAccepted")
    .replaceAll("${stamp}-updated-chrome-full-sources","${stamp}-recorded-timeline-full-sources")
    .replaceAll('["driver","traceHelper","stager","supervisor"]','["driver","traceHelper","stager","supervisor","generatedCaller"]');
  return exactPatch(source,[[source,named],
    [`import {materializeLayeredFullSourceArchive} from ${JSON.stringify(uri("threaded-validation-full-sources.mjs"))};`,
      `import {materializeUpdatedFullArchive as materializeLayeredFullSourceArchive} from ${JSON.stringify(uri("updated-chrome-full-sources.mjs"))};`],
    ["evidence/2026-10-15T22-27-06-823Z-threaded-validation-full-live.json","evidence/2026-10-16T17-01-47-260Z-updated-chrome-full-terminal.json"],
    ["evidence/2026-10-16T16-36-10-030Z-threaded-validation-reboot-recovery.json","evidence/2026-10-16T17-01-47-260Z-updated-chrome-full-terminal-analysis.json"],
    ["de225152dfb7dd326856109d2d045cec1ddea6fae7d7f339a112874a9e710fe1","f148770cdeb53d7923a51aee3116588bf07491c63ee1042e49929a203981d43b"],
    ["  const archive=await materializeLayeredFullSourceArchive(root,proof.sourceArchive);",
      "  const restored=await materializeLayeredFullSourceArchive(root,proof.sourceArchive);const archive={...restored,sourcePins:restored.pins};"],
    ['assert.equal(recovery.status,"reboot-interrupted-attempt-audited-restored-and-cleaned-not-acceptance");',
      'assert.equal(recovery.analysis.status,"genuine-full-encode-save-observed-below-budget-independent-timeline-count-failed");'],
    ["recovery.live.sha256","recovery.terminal.sha256"],
    ["recovery.all750ExecutedCurrentPreimagesVerified","recovery.all750ExecutedPreCurrentPostPinsVerified"],
  ]);
}
const root=path.resolve(import.meta.dirname,"../.."),recipe=deriveRecordedTimelineSourceLayer(await readFile(path.join(root,"scripts/lib/updated-chrome-full-sources.mjs"),"utf8"),root);
const components=await import("data:text/javascript;base64,"+Buffer.from(recipe.generated).toString("base64"));
export const captureUpdatedFullSources=components.captureUpdatedFullSources;
export const writeUpdatedFullArchive=components.writeUpdatedFullArchive;
export const materializeUpdatedFullArchive=components.materializeUpdatedFullArchive;
export const UPDATED_FULL_PARENT=components.UPDATED_FULL_PARENT;
