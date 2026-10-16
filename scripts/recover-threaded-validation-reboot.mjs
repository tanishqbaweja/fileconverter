// One explicit historical attempt only. No processes are killed or restarted.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, copyFile, lstat, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";
import { materializeLayeredFullSourceArchive } from "./lib/threaded-validation-full-sources.mjs";
import { inspectInstalledChromePin } from "./lib/installed-chrome-pin.mjs";
import { inspectRebootInterruption } from "./lib/reboot-interruption.mjs";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { sha, baselineBinding } from "./lib/stable-ui-headless-baseline-recipe.mjs";

const root = path.resolve(import.meta.dirname, ".."), exec = promisify(execFile);
assert.equal(process.platform, "win32"); assert.equal(process.argv.length, 2);
const supervisorPath = "evidence/2026-10-15T22-26-52-632Z-threaded-validation-supervisor-full.json";
const livePath = "evidence/2026-10-15T22-27-06-823Z-threaded-validation-full-live.json";
const checkpointPath = "outputs/reports/2026-10-15T22-28-56-383Z-private-mpeg2-threaded-validation-full-native-100ms-native-checkpoint.json";
const read = file => readFile(path.join(root, file));
const supervisorBytes = await read(supervisorPath), supervisor = JSON.parse(supervisorBytes);
const liveBytes = await read(livePath), live = JSON.parse(liveBytes);
const checkpointBytes = await read(checkpointPath), checkpoint = JSON.parse(checkpointBytes);
assert.equal(supervisor.status, "running"); assert.equal(supervisor.childExit, null);
assert.equal(live.status, "actual-changed-full-driver-launched-not-acceptance");
const archive = await materializeLayeredFullSourceArchive(root, live.sourceArchive);
assert.deepEqual(archive.sourcePins, live.sourcePins); assert.equal(Object.keys(archive.sourcePins).length, 726);
const directories = [
  live.wrapper, live.candidateDirectory, supervisor.runtimeDirectory,
  path.join(root, "work/threaded-validation-full-caller-XeaoU0"),
  path.join(root, "work/allocation-attempt-full-runtime-R4Dngj"),
];
assert.equal(sha(await readFile(path.join(live.wrapper, "probe.mjs"))), live.sourceArchive.driverSha256);
assert.equal(sha(await readFile(path.join(live.wrapper, "trace-helper.mjs"))), live.sourceArchive.traceHelperSha256);
assert.equal(sha(await readFile(path.join(directories[3], "caller.mjs"))), live.sourceArchive.generatedCallerSha256);
const terminalNames = (await readdir(path.join(root, "evidence"))).filter(name =>
  name >= "2026-10-15T22-26" && /threaded-validation-original-full-terminal\.json$/.test(name));
assert.deepEqual(terminalNames, [], "Inspect any actual terminal report instead of interruption recovery");
const identities = [supervisor.supervisorIdentity, supervisor.childIdentity, live.driverIdentity,
  checkpoint.identities.root, checkpoint.identities.monitor, ...checkpoint.native.identities];
const ownedPids = [...new Set(identities.map(row => row.pid))];
const tokens = directories.map(value => value.replaceAll("'", "''"));
const observe = async () => {
  const command = `$ErrorActionPreference='Stop'; $recoveryTokens=@(${tokens.map(t => `'${t}'`).join(",")}); ` +
    `$recoveryPids=@(${ownedPids.join(",")}); $recoveryRows=@(Get-CimInstance Win32_Process | Where-Object { ` +
    `$recoveryRow=$_; $recoveryRow.ProcessId -ne $PID -and ($recoveryPids -contains $recoveryRow.ProcessId -or ` +
    `@($recoveryTokens | Where-Object {$recoveryRow.CommandLine -and $recoveryRow.CommandLine.Contains($_)}).Count -gt 0) } | ` +
    `ForEach-Object {[pscustomobject]@{pid=$_.ProcessId;parentPid=$_.ParentProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');name=$_.Name;commandLine=$_.CommandLine}}); ` +
    `[pscustomobject]@{observedUtc=(Get-Date).ToUniversalTime().ToString('o');bootUtc=(Get-CimInstance Win32_OperatingSystem).LastBootUpTime.ToUniversalTime().ToString('o');processes=$recoveryRows}|ConvertTo-Json -Depth 4 -Compress`;
  const {stdout} = await exec("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command],
    {windowsHide: true, timeout: 30000, maxBuffer: 1048576});
  const state = JSON.parse(stdout);
  for (const row of state.processes) {
    assert.ok(Date.parse(row.createdAt) >= Date.parse(state.bootUtc), "Unexpected preboot process identity");
    assert.ok(!directories.some(dir => row.commandLine?.toLowerCase().includes(dir.toLowerCase())), "An owned-path process exists now");
  }
  return state;
};
const before = await observe(), analysis = inspectRebootInterruption(checkpoint, before.bootUtc, identities);
const protectedSource = async () => {
  const file = path.join(root, "test.mkv"), stat = await lstat(file);
  assert.ok(stat.isFile() && !stat.isSymbolicLink()); assert.equal(stat.size, 2958573265);
  const hash = createHash("sha256"); for await (const chunk of createReadStream(file, {highWaterMark:1048576})) hash.update(chunk);
  const sha256 = hash.digest("hex"); assert.equal(sha256, live.protectedBefore.sha256);
  return {bytes:stat.size, sha256};
};
// Reject reparse points and capture the exact current identity before any removal.
const work = path.join(root, "work"); assert.equal((await realpath(work)).toLowerCase(), work.toLowerCase());
async function inventory(directory) {
  assert.equal(path.dirname(directory), work);
  const original = await lstat(directory, {bigint:true});
  assert.ok(original.isDirectory() && !original.isSymbolicLink());
  assert.equal((await realpath(directory)).toLowerCase(), directory.toLowerCase());
  assert.ok(Number(original.birthtimeMs) >= Date.parse(supervisor.startedAt) - 2000 && Number(original.birthtimeMs) < Date.parse(checkpoint.updatedAt));
  let bytes = 0, files = 0;
  async function visit(dir) {
    for (const name of await readdir(dir)) {
      const file = path.join(dir, name), row = await lstat(file);
      assert.ok(!row.isSymbolicLink(), "No recursive cleanup through reparse points");
      assert.equal((await realpath(file)).toLowerCase(), file.toLowerCase());
      if (row.isDirectory()) await visit(file); else {assert.ok(row.isFile()); bytes += row.size; files++;}
    }
  }
  await visit(directory);
  return {directory,bytes,files,dev:String(original.dev),ino:String(original.ino),birthtimeNs:String(original.birthtimeNs)};
}
const inventoryRows = []; for (const directory of directories) inventoryRows.push(await inventory(directory));
const candidate = JSON.parse(await readFile(path.join(live.candidateDirectory, "build-manifest.json")));
assert.deepEqual(candidate, live.composition.manifest);
for (const [file, hash] of Object.entries(candidate.artifacts))
  assert.equal(sha(await readFile(path.join(live.candidateDirectory,file))), hash, file);
// Read the historically qualified stager, not its current-browser qualification loader.
// This path only restores exact owned generated assets; it never runs conversions.
const mediaBytes = await read(live.qualifiedBrowser.path);
assert.equal(sha(mediaBytes), live.qualifiedBrowser.sha256);
const media = JSON.parse(mediaBytes), zipped = await read(media.generatedArchive.path);
assert.equal(sha(zipped), media.generatedArchive.sha256);
const raw = gunzipSync(zipped, {maxOutputLength:8388608}); assert.equal(sha(raw), media.generatedArchive.restoredSha256);
const historical = JSON.parse(raw), stage = historical.generated.stage;
const marker = "const adapter = ", start = stage.indexOf(marker), end = stage.indexOf(";\nconst replacing = ", start);
assert.ok(start > 0 && end > start); const adapter = JSON.parse(stage.slice(start + marker.length, end));
const replacing = ["within-remux.mjs","within-remux.wasm","within-mpeg4.mjs","within-mpeg4.wasm","within-direct.mjs","within-direct.wasm"];
const added = [
  ["_private_split_decoder.mjs",path.join(live.candidateDirectory,"within-mpeg2-split.mjs")],
  ["_private_split_decoder.wasm",path.join(live.candidateDirectory,"within-mpeg2-split.wasm")],
  ["_private_split_encoder.mjs",path.join(live.candidateDirectory,"split-encoder.mjs")],
  ["_private_split_encoder.wasm",path.join(live.candidateDirectory,"split-encoder.wasm")],
  ...["mpeg2-split-session.mjs","mpeg2-split-frame-bridge.mjs","mpeg2-split-frame-layout.mjs","mpeg2-split-frame-properties.mjs","mpeg2-split-packet-bridge.mjs"].map(file=>[file,path.join(root,"scripts/lib",file)]),
];
const target = path.join(root,"dist/client/engines/remux"), published = path.join(root,"public/engines/remux");
for (const file of replacing) assert.equal(sha(await readFile(path.join(target,file))),file.endsWith(".mjs")?sha(adapter):candidate.artifacts["within-mpeg2-split.wasm"]);
for (const [file,from] of added) assert.equal(sha(await readFile(path.join(target,file))),sha(await readFile(from)));
const publishedManifest = JSON.parse(await readFile(path.join(published,"build-manifest.json")));
const originalPublished = {};
for (const file of replacing) {
  originalPublished[file] = sha(await readFile(path.join(published,file)));
  // The checked-in public files must also remain identical to HEAD.
  const {stdout} = await exec("git",["show",`HEAD:public/engines/remux/${file}`],{cwd:root,windowsHide:true,encoding:"buffer",maxBuffer:16777216});
  assert.equal(sha(stdout),originalPublished[file]);
}
const stamp = new Date().toISOString().replaceAll(/[:.]/g,"-");
const reportPath = `evidence/${stamp}-threaded-validation-reboot-recovery.json`;
const ownSources = {};
for (const file of ["scripts/recover-threaded-validation-reboot.mjs","scripts/lib/reboot-interruption.mjs","tests/reboot-interruption.test.mjs"]) {
  const bytes=await read(file);ownSources[file]={sha256:sha(bytes),base64:bytes.toString("base64")};
}
const receipt = {status:"preflight-verified-recovery-pending",recordedAt:new Date().toISOString(),analysis,
  supervisor:{path:supervisorPath,sha256:sha(supervisorBytes)},live:{path:livePath,sha256:sha(liveBytes)},
  checkpoint:{path:checkpointPath,sha256:sha(checkpointBytes)},sourceArchive:live.sourceArchive,
  all726ExecutedCurrentPreimagesVerified:true,originalLaunchIdentities:identities,processObservationBefore:before,
  inventory:inventoryRows,protectedBefore:await protectedSource(),browserNow:await inspectInstalledChromePin(),
  browserQualificationInvalidatedByUpdate:true,originalPublished,publishedManifestSha256:sha(JSON.stringify(publishedManifest)),
  ownSources,removed:[],assetsRestored:false,productionRestored:false,protectedAfter:null,failure:null,
  noProcessesKilled:true,noConversionRestarted:true,fullOriginalAcceptance:false,publicAcceptance:false};
await writeFile(path.join(root,reportPath),JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
let cleanupAllowed=false, commandRuntime;
try {
  await observe();
  for (const file of replacing) await copyFile(path.join(published,file),path.join(target,file));
  for (const [file] of added) await rm(path.join(target,file));
  for (const file of replacing) assert.equal(sha(await readFile(path.join(target,file))),originalPublished[file]);
  receipt.assetsRestored=true; cleanupAllowed=true;
  commandRuntime=await createOwnedRuntimeScratch("reboot-recovery-build-");
  const begin=Date.now();
  const result=await exec(process.execPath,["node_modules/vinext/dist/cli.js","build"],
    {cwd:root,env:{...commandRuntime.env,NEXT_TELEMETRY_DISABLED:"1",WRANGLER_SEND_METRICS:"false"},windowsHide:true,timeout:180000,maxBuffer:2097152});
  receipt.build={elapsedMs:Date.now()-begin,stdoutTail:result.stdout.slice(-8192),stderrTail:result.stderr.slice(-4096)};
  assert.equal(sha(await read("dist/client"+baselineBinding.url)),baselineBinding.sha256);
  assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")),"f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
  receipt.productionRestored=true;
} catch(error) {receipt.failure={name:error.name,message:error.message.slice(0,8192)};process.exitCode=1;}
finally {
  try {
    if(commandRuntime)await commandRuntime.close();
    if(cleanupAllowed) {
      receipt.processObservationBeforeCleanup=await observe();
      for(const row of inventoryRows) {
        const now=await inventory(row.directory);assert.equal(now.dev,row.dev);assert.equal(now.ino,row.ino);assert.equal(now.birthtimeNs,row.birthtimeNs);
        await rm(row.directory,{recursive:true,maxRetries:5,retryDelay:100});
        await assert.rejects(access(row.directory),{code:"ENOENT"});receipt.removed.push(row);
      }
    }
    receipt.protectedAfter=await protectedSource();assert.deepEqual(receipt.protectedAfter,receipt.protectedBefore);
    receipt.processObservationAfter=await observe();
  }catch(error){receipt.cleanupFailure={name:error.name,message:error.message.slice(0,8192)};process.exitCode=1;}
  receipt.finishedAt=new Date().toISOString();
  receipt.status=receipt.failure||receipt.cleanupFailure?"recovery-incomplete":"reboot-interrupted-attempt-audited-restored-and-cleaned-not-acceptance";
  await writeFile(path.join(root,reportPath),JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({reportPath,status:receipt.status,removedBytes:receipt.removed.reduce((sum,row)=>sum+row.bytes,0),failure:receipt.failure,cleanupFailure:receipt.cleanupFailure??null}));
}
