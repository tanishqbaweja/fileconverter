import assert from "node:assert/strict";
import { access,readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { sha } from "../scripts/lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "../scripts/lib/realloc-full-sources.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file));
const proof=JSON.parse(await read("evidence/2026-10-14T15-12-33-678Z-realloc-chrome-pin-rejection.json"));
test("actual Chrome155 launcher mismatch rejects BEFORE conversion; old154 hash gate not removed or re-labelled success",async()=>{
  const bytes=await read(proof.terminal.path),terminal=JSON.parse(bytes);assert.equal(sha(bytes),proof.terminal.sha256);
  assert.equal(terminal.executions,0);assert.equal(terminal.status,"failed-or-incomplete");assert.equal(terminal.driverIdentity,null);assert.equal(terminal.sourceArchive,null);
  assert.equal(proof.expected.version,"154.0.8037.98");assert.equal(proof.installed.version,"155.0.8059.40");
  assert.notEqual(proof.expected.launcherSha256,proof.installed.launcherSha256);assert.ok(terminal.failure.includes(proof.expected.launcherSha256)&&terminal.failure.includes(proof.installed.launcherSha256));
  assert.equal(proof.browserPinGateRelaxed,false);assert.equal(proof.browserConversions,0);assert.equal(proof.publicAcceptance,false);assert.equal(proof.primaryIncrementalPrivateMiB,null);
});
test("all493 rejected-launch source pins recover from ACTUAL preparation, no fabricated failed ephemeral caller or rewritten old snapshots",async()=>{
  const archive=await materializeLayeredFullSourceArchive(root,proof.recoveredPreimagesFromActualPreparation.archive);
  assert.deepEqual(archive.sourcePins,proof.sourcePins);assert.deepEqual(proof.sourcePins,proof.postSourcePins);assert.equal(Object.keys(proof.sourcePins).length,493);
  for(const [file,hash] of Object.entries(proof.sourcePins)){assert.equal(sha(await read(file)),hash,file);assert.equal(sha(Buffer.from(archive.sourcePreimages[file].data,"base64")),hash,file);}
  assert.equal(proof.failedLaunchEphemeralCallerPreimageSeparatelyUnavailable,true);
  assert.equal(sha(await read(proof.ownSource.path)),proof.ownSource.sha256);assert.equal(sha(Buffer.from(proof.ownSource.preimage,"base64")),proof.ownSource.sha256);
});
test("supervisor/child born identities independently absent, owned scratch gone, original whole checksum unchanged and no staging/converted copies",async()=>{
  const bytes=await read(proof.supervisor.path),supervisor=JSON.parse(bytes);assert.equal(sha(bytes),proof.supervisor.sha256);
  assert.equal(supervisor.status,"command-failed-not-conversion-acceptance");assert.equal(supervisor.childExit.code,1);assert.equal(supervisor.runtimeRemoved,true);
  for(const row of proof.birthChecks)assert.equal(row.status,"owned-identity-absent");assert.equal(proof.birthChecks.length,2);
  await assert.rejects(access(supervisor.runtimeDirectory),{code:"ENOENT"});await assert.rejects(access(path.join(root,"work/realloc-full-caller-bgORNF")),{code:"ENOENT"});
  assert.equal(proof.noBrowserProfileOrCandidateCreated,true);assert.equal(proof.restorationNotInvokedBecauseStagingNeverStarted,true);
  assert.equal(proof.protectedWholePrePostCurrentSha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");
  for(const [name,hash] of Object.entries(proof.stockAssetsUnchangedAtIndependentInspection))assert.equal(sha(await read("dist/client/engines/remux/"+name)),hash);
});
