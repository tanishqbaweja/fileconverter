import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { makeEbmlFullCaller as parentCaller,makeEbmlFullSupervisor as parentSupervisor } from "./composited-handoff-full-recipe.mjs";
export { loadQualifiedEbmlMedia,createAttemptPlaneCandidate,verifyAttemptPlaneCandidate,makeEbmlFullDriver } from "./composited-handoff-full-recipe.mjs";
export const PREFLIGHT_FULL_FILES=["scripts/lib/reliable-readonly-preflight.mjs","scripts/lib/preflight-handoff-full-recipe.mjs",
  "scripts/run-preflight-handoff-full.mjs","tests/reliable-readonly-preflight.test.mjs",
  "evidence/2026-10-15T17-32-47-545Z-composited-handoff-original-full-terminal.json",
  "evidence/2026-10-15T17-32-28-152Z-composited-handoff-supervisor-full.json"];
export async function makeEbmlFullCaller(root) {
  const parent=await parentCaller(root);
  const failed=JSON.parse(await readFile(path.join(root,PREFLIGHT_FULL_FILES[4])));
  assert.equal(failed.executions,0);assert.equal(failed.status,"failed-or-incomplete");assert.match(failed.failure,/VersionInfo\.ProductVersion/);
  assert.deepEqual(failed.cleanupErrors,[]);assert.equal(failed.productionRestored,true);assert.equal(failed.wrapperAbsent,true);assert.equal(failed.candidateAbsent,true);
  const before=pathToFileURL(path.join(root,"scripts/lib/composited-handoff-full-recipe.mjs")).href;
  const after=pathToFileURL(path.join(root,"scripts/lib/preflight-handoff-full-recipe.mjs")).href;
  assert.equal(parent.generated.split(before).length-1,3);
  const renamed=parent.generated.replaceAll(before,after);
  return {...parent,...exactPatch(parent.generated,[[parent.generated,renamed],
    ['browserMode: "headless", subprocessWindowsHidden: true, requestedRuns: 3,',
      'browserMode: "headless", subprocessWindowsHidden: true, readonlyPreflight:{source:"scripts/lib/reliable-readonly-preflight.mjs",maximumAttempts:3,timeoutMs:15000,nodeOptions:process.env.NODE_OPTIONS}, requestedRuns: 3,'],
    ['const callerFiles = [','const callerFiles = ['+PREFLIGHT_FULL_FILES.map(file=>JSON.stringify(file)).join(",")+',']]),
    extraFiles:[...parent.extraFiles,...PREFLIGHT_FULL_FILES],readonlyPreflightRetryOnly:true};
}
export async function makeEbmlFullSupervisor(source,root) {
  const parent=await parentSupervisor(source,root),before="scripts/run-composited-handoff-full.mjs",after="scripts/run-preflight-handoff-full.mjs";
  assert.equal(parent.generated.split(before).length-1,3);
  const generated=parent.generated.replaceAll(before,after);
  return {...parent,...exactPatch(parent.generated,[[parent.generated,generated]]),readonlyPreflightRetryOnly:true};
}
