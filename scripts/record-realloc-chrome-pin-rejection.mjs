// Actual terminal zero-conversion rejection; qualify current source/preimages,
// installed binary and owned cleanup without relaxing the browser pin gate.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access,readFile,stat,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { sha,baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { materializeLayeredFullSourceArchive } from "./lib/realloc-full-sources.mjs";
import { observeOwnedProcessExit } from "./lib/owned-process-exit-observation.mjs";
assert.equal(process.argv.length,2);
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),exec=promisify(execFile);
const terminalPath="evidence/2026-10-14T15-12-33-678Z-realloc-original-full-terminal.json",terminalBytes=await read(terminalPath),terminal=JSON.parse(terminalBytes);
assert.equal(terminal.executions,0);assert.equal(terminal.status,"failed-or-incomplete");assert.equal(terminal.sourceArchive,null);assert.equal(terminal.driverIdentity,null);
assert.equal(terminal.wrapper,null);assert.equal(terminal.candidateDirectory,null);assert.deepEqual(terminal.cleanupErrors,[]);
const supervisorPath="evidence/2026-10-14T15-12-30-962Z-realloc-supervisor-full.json",supervisorBytes=await read(supervisorPath),supervisor=JSON.parse(supervisorBytes);
assert.equal(supervisor.status,"command-failed-not-conversion-acceptance");assert.equal(supervisor.childExit.code,1);assert.equal(supervisor.runtimeRemoved,true);
const birthChecks=await Promise.all([supervisor.supervisorIdentity,supervisor.childIdentity].map(identity=>observeOwnedProcessExit(identity)));
for(const row of birthChecks)assert.equal(row.status,"owned-identity-absent");await assert.rejects(access(supervisor.runtimeDirectory),{code:"ENOENT"});
const caller="work/realloc-full-caller-bgORNF";await assert.rejects(access(path.join(root,caller)),{code:"ENOENT"});
const prepPath="evidence/2026-10-14T09-36-15-026Z-realloc-original-full-preparation.json",prepBytes=await read(prepPath),prep=JSON.parse(prepBytes);
assert.deepEqual(terminal.sourcePins,prep.sourcePins);assert.deepEqual(terminal.postSourcePins,terminal.sourcePins);
const recovered=await materializeLayeredFullSourceArchive(root,prep.sourceArchive);assert.deepEqual(recovered.sourcePins,terminal.sourcePins);assert.equal(Object.keys(terminal.sourcePins).length,493);
const prior=JSON.parse(await read("evidence/2026-10-12T19-50-01-210Z-input-read-original-full-terminal.json")),oldRaw=JSON.parse(gunzipSync(await read(prior.candidate.compressedReport.path),{maxOutputLength:33554432}));
const expected={version:oldRaw.browserVersion,launcherSha256:oldRaw.progressProbe.chromeLauncherSha256,librarySha256:oldRaw.progressProbe.chromeLibrarySha256};
assert.equal(expected.version,"154.0.8037.98");assert.equal(expected.launcherSha256,"6849d2982038de9f9489a7b3858f3b785b7fec06a842c93c517281d21995c8ca");
const chrome="C:/Program Files/Google/Chrome/Application/chrome.exe";
const meta=await exec("powershell.exe",["-NoProfile","-NonInteractive","-Command","$ErrorActionPreference='Stop'; $chromePinFile=Get-Item -LiteralPath 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'; [pscustomobject]@{version=$chromePinFile.VersionInfo.ProductVersion;bytes=$chromePinFile.Length} | ConvertTo-Json -Compress"],{windowsHide:true,timeout:5000,maxBuffer:16384});
const installed=JSON.parse(meta.stdout);assert.match(installed.version,/^\d+\.\d+\.\d+\.\d+$/);
const hashFile=async file=>{const digest=createHash("sha256");for await(const chunk of createReadStream(file,{highWaterMark:1048576}))digest.update(chunk);return digest.digest("hex");};
installed.launcherSha256=await hashFile(chrome);assert.equal(installed.launcherSha256,"f76f0234efb271041dc84f9f38fb858e01859d5da6f775f5108668eb3ae80975");
assert.ok(terminal.failure.includes(installed.launcherSha256)&&terminal.failure.includes(expected.launcherSha256));
const library=path.join(path.dirname(chrome),installed.version,"chrome.dll");installed.libraryBytes=(await stat(library)).size;installed.librarySha256=await hashFile(library);
const original=path.join(root,"test.mkv");assert.equal((await stat(original)).size,2958573265);const originalSha256=await hashFile(original);
assert.equal(originalSha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");assert.deepEqual(terminal.protectedBefore,terminal.protectedAfter);assert.equal(terminal.protectedAfter.sha256,originalSha256);
const stock={};for(const file of ["within-remux.mjs","within-remux.wasm","within-mpeg4.mjs","within-mpeg4.wasm","within-direct.mjs","within-direct.wasm"]){stock[file]=sha(await read("public/engines/remux/"+file));assert.equal(sha(await read("dist/client/engines/remux/"+file)),stock[file]);}
assert.equal(sha(await read("dist/client"+baselineBinding.url)),baselineBinding.sha256);
const ownFile="scripts/record-realloc-chrome-pin-rejection.mjs",ownBytes=await read(ownFile),output="evidence/2026-10-14T15-12-33-678Z-realloc-chrome-pin-rejection.json";
await writeFile(path.join(root,output),JSON.stringify({recordedAt:new Date().toISOString(),status:"installed-chrome-pin-changed-rejected-before-browser-conversion",
  terminal:{path:terminalPath,sha256:sha(terminalBytes)},supervisor:{path:supervisorPath,sha256:sha(supervisorBytes)},expected,installed,birthChecks,
  sourceCount:493,sourcePins:terminal.sourcePins,postSourcePins:terminal.postSourcePins,
  recoveredPreimagesFromActualPreparation:{path:prepPath,sha256:sha(prepBytes),archive:prep.sourceArchive},all493PreimagesCurrentVerified:true,
  failedLaunchEphemeralCallerPreimageSeparatelyUnavailable:true,browserConversions:0,browserDriverExecutions:0,noBrowserProfileOrCandidateCreated:true,
  ownedSupervisorRuntimeGone:true,ownedCallerGone:true,stockAssetsUnchangedAtIndependentInspection:stock,restorationNotInvokedBecauseStagingNeverStarted:true,
  protectedWholePrePostCurrentSha256:originalSha256,browserPinGateRelaxed:false,noProcessesKilled:true,noDocker:true,
  primaryIncrementalPrivateMiB:null,fullOriginalAcceptance:false,publicAcceptance:false,speedGainProven:false,
  next:"Fresh real headless installed-Chrome155 decoder/fatal/media qualification with before/after launcher/library pin; then fresh full caller binds qualified current browser instead of deleting pin checks.",
  ownSource:{path:ownFile,sha256:sha(ownBytes),preimage:ownBytes.toString("base64")}},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output,expectedVersion:expected.version,installedVersion:installed.version,browserConversions:0,ownedBirthsAbsent:birthChecks.length,originalSha256}));
