// Fresh browser qualification; replay the complete actual726-source parent.
// No automatic retries. All conversions remain in the production browser.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import {spawn,execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {lstat,readFile,readdir,rm,statfs,writeFile} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";
import {gzipSync,gunzipSync} from "node:zlib";
import {createOwnedRuntimeScratch} from "./lib/owned-runtime-scratch.mjs";
import {loadUpdatedChromeQualification,copyUpdatedChromeCandidate} from "./lib/updated-chrome-qualification.mjs";
import {deriveUpdatedChromeFullDriver,deriveUpdatedChromeFullStager,deriveUpdatedChromeSupervisor} from "./lib/updated-chrome-full-recipe.mjs";
import {captureUpdatedFullSources,writeUpdatedFullArchive,materializeUpdatedFullArchive,UPDATED_FULL_PARENT} from "./lib/updated-chrome-full-sources.mjs";
import {materializeLayeredFullSourceArchive} from "./lib/threaded-validation-full-sources.mjs";
import {verifyThreadValidatorQualification} from "./lib/threaded-validator-qualification.mjs";
import {inspectStressHostMemory} from "./lib/host-memory-preflight.mjs";
import {inspectInstalledChromePin,assertInstalledChromePinsEqual} from "./lib/installed-chrome-pin.mjs";
import {queryReliableProcessIdentity} from "./lib/reliable-owned-identity.mjs";
import {observeOwnedProcessExit} from "./lib/owned-process-exit-observation.mjs";
import {boundedTail} from "./lib/bounded-supervisor-journal.mjs";
import {validateFullLaunchState} from "./lib/full-launch-journal.mjs";
import {sha,baselineBinding} from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),exec=promisify(execFile);
process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT="evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
const args=process.argv.slice(2),supervisor=deriveUpdatedChromeSupervisor(await readFile(path.join(root,"scripts/launch-packet-largest-idle-supervisor.mjs"),"utf8"),root);
if(args[0]==="--supervise"||args[0]==="--worker") {
  if(args[0]==="--supervise"){assert.equal(args.length,1);process.argv.splice(2,1,"--full");}
  await import("data:text/javascript;base64,"+Buffer.from(supervisor.generated).toString("base64"));
}else {
  assert.ok(args.length===0||(args.length===1&&args[0]==="--prepare-only"));
  await run(args.length===1);
}
async function run(prepareOnly) {
  const qualified=await loadUpdatedChromeQualification(root),native=await verifyThreadValidatorQualification(root);
  const parent=JSON.parse(await read(UPDATED_FULL_PARENT));
  const previous=await materializeLayeredFullSourceArchive(root,parent.sourceArchive);
  assert.equal(Object.keys(previous.sourcePins).length,726);
  // A stale status file is never evidence of liveness or permission to duplicate.
  for(const file of (await readdir(path.join(root,"evidence"))).filter(name=>/updated-chrome-full-(?:live|terminal)\.json$/.test(name))) {
    const old=JSON.parse(await read(`evidence/${file}`));if(!old.driverIdentity)continue;
    assert.equal((await observeOwnedProcessExit(old.driverIdentity)).status,"owned-identity-absent","Existing full driver not proven absent; do not restart");
  }
  const host=await inspectStressHostMemory();assert.equal(host.safeToStart,true);
  const disk=await statfs(root);assert.ok(disk.bavail*disk.bsize>=32*1024**3);
  const normal=async()=>{
    assert.equal(sha(await read("dist/client"+baselineBinding.url)),baselineBinding.sha256);
    assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")),"f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
  };
  const protectedSource=async()=>{
    const file=path.join(root,"test.mkv"),row=await lstat(file);assert.ok(row.isFile()&&!row.isSymbolicLink());assert.equal(row.size,2958573265);
    const hash=createHash("sha256");for await(const chunk of createReadStream(file,{highWaterMark:1048576}))hash.update(chunk);
    const sha256=hash.digest("hex");assert.equal(sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");return {bytes:row.size,sha256};
  };
  await normal();const protectedBefore=await protectedSource(),stamp=new Date().toISOString().replaceAll(/[:.]/g,"-");
  const ownFiles=["scripts/run-updated-chrome-full.mjs","scripts/lib/updated-chrome-qualification.mjs","scripts/lib/updated-chrome-full-recipe.mjs",
    "scripts/lib/updated-chrome-full-sources.mjs","scripts/lib/full-launch-journal.mjs","tests/updated-chrome-full.test.mjs","tests/full-launch-journal.test.mjs",
    "tests/updated-chrome-evidence.test.mjs","tests/updated-chrome-preparation.test.mjs","scripts/launch-packet-largest-idle-supervisor.mjs"];
  const snapshot=await captureUpdatedFullSources(root,[...qualified.files,...ownFiles]);
  const wrapper=await createOwnedRuntimeScratch("updated-chrome-full-wrapper-");let candidate;
  const livePath=`evidence/${stamp}-updated-chrome-full-live.json`,terminalPath=`evidence/${stamp}-updated-chrome-full-${prepareOnly?"preparation":"terminal"}.json`;
  const receipt={status:"preparing-not-accepted",recordedAt:new Date().toISOString(),prepareOnly,executions:0,
    qualifiedBrowser:qualified.reference,browserPinBefore:qualified.pin,browserPinAfter:null,nativeQualification:native.reference,nativeQualificationAfter:null,
    hostPreflight:host,diskFreeBytes:disk.bavail*disk.bsize,protectedBefore,protectedAfter:null,
    sourcePins:snapshot.pins,postSourcePins:null,parent:snapshot.parent,sourceLimits:snapshot.limits,
    wrapper:wrapper.directory,candidateDirectory:null,driverSpawned:false,driverIdentity:null,driverAbsent:null,
    sourceArchive:null,report:null,failure:null,cleanupErrors:[],productionRestored:false,wrapperRemoved:false,candidateRemoved:false,
    requestedRuns:3,primaryLimitMiB:250,nativeBitRate:4000000,publicAcceptance:false,fullOriginalAcceptance:false,completeChromiumMemoryAcceptance:false};
  let driverClosed=true,buildStarted=false;
  const verifyStoppedTree=async()=>{
    assert.ok(!receipt.driverSpawned||receipt.driverIdentity,"Driver birth unavailable; retain owned data for evidence-based recovery");
    if(!receipt.driverIdentity)return;
    const paths=[wrapper.directory,candidate.directory],births=[receipt.driverIdentity];
    const names=(await readdir(path.join(root,"outputs/reports"))).filter(file=>file.endsWith("-private-mpeg2-updated-chrome-full-native-100ms-launches.json"));
    assert.ok(names.length<=128);let found=0;
    for(const file of names) {
      const journal=JSON.parse(await read(`outputs/reports/${file}`));
      if(journal.driverIdentity.pid!==receipt.driverIdentity.pid||Math.abs(Date.parse(journal.driverIdentity.createdAt)-Date.parse(receipt.driverIdentity.createdAt))>=1)continue;
      found++;validateFullLaunchState(root,journal);births.push(...journal.launches.map(row=>row.identity));
      if(journal.runtimeDirectory)paths.push(journal.runtimeDirectory);
      const checkpointFile=file.replace("-launches.json","-native-checkpoint.json");
      try{const checkpoint=JSON.parse(await read(`outputs/reports/${checkpointFile}`));births.push(...checkpoint.native.identities);}
      catch(error){if(error.code!=="ENOENT")throw error;}
    }
    assert.ok(found<=1);const pids=[...new Set(births.map(row=>row.pid))];assert.ok(pids.length<=512);
    const command="$ErrorActionPreference='Stop'; $fullCleanupPids=@("+pids.join(",")+"); $fullCleanupPaths=@("+
      paths.map(value=>"'"+value.replaceAll("'","''")+"'").join(",")+"); ConvertTo-Json -InputObject @(Get-CimInstance Win32_Process | Where-Object {"+
      "$fullCleanupRow=$_; $fullCleanupRow.ProcessId -ne $PID -and ($fullCleanupPids -contains $fullCleanupRow.ProcessId -or "+
      "@($fullCleanupPaths | Where-Object {$fullCleanupRow.CommandLine -and $fullCleanupRow.CommandLine.Contains($_)}).Count -gt 0) } | "+
      "ForEach-Object {@{pid=[int]$_.ProcessId;createdAt=$_.CreationDate.ToUniversalTime().ToString('o');commandLine=$_.CommandLine}}) -Compress";
    const {stdout}=await exec("powershell.exe",["-NoProfile","-NonInteractive","-Command",command],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:1048576});
    const current=JSON.parse(stdout);
    for(const row of current) {
      assert.ok(!births.some(birth=>birth.pid===row.pid&&Math.abs(Date.parse(birth.createdAt)-Date.parse(row.createdAt))<1),"A recorded owned birth remains live");
      assert.ok(!paths.some(directory=>row.commandLine?.toLowerCase().includes(directory.toLowerCase())),"An owned-path descendant remains live");
    }
    receipt.treeCleanupAudit={acquiredAt:new Date().toISOString(),durableJournalFound:found===1,recordedBirths:births,current,paths,noProcessesKilled:true};
  };
  try {
    candidate=await createOwnedRuntimeScratch("allocation-attempt-media-");receipt.candidateDirectory=candidate.directory;
    await copyUpdatedChromeCandidate(root,candidate.directory,qualified);
    const recipe=deriveUpdatedChromeFullDriver(previous.generated,root,wrapper.directory,path.basename(candidate.directory),snapshot.extensionFiles,qualified.pin);
    const stager=deriveUpdatedChromeFullStager(qualified.archive.recipe.generated.stage,qualified.archive.recipe.generated.candidateName,path.basename(candidate.directory));
    const traceHelper=previous.traceHelper.replaceAll("allocation-attempt-full-wrapper-fZzR1b",path.basename(wrapper.directory));
    const runtimeSources={driver:recipe.generated,stager:stager.generated,traceHelper,supervisor:supervisor.generated,edits:recipe.edits};
    receipt.sourceArchive=await writeUpdatedFullArchive(root,stamp,snapshot,runtimeSources);
    const replayed=await materializeUpdatedFullArchive(root,receipt.sourceArchive);assert.equal(replayed.driver,recipe.generated);
    for(const [name,body]of [["probe.mjs",recipe.generated],["trace-helper.mjs",traceHelper],["stage.mjs",stager.generated]]) {
      const file=path.join(wrapper.directory,name);await writeFile(file,body,{flag:"wx"});
      await exec(process.execPath,["--check",file],{cwd:root,env:wrapper.env,windowsHide:true,maxBuffer:16384});
    }
    receipt.status=prepareOnly?"prepared-not-executed":"prepared-before-browser-build-not-accepted";
    await writeFile(path.join(root,livePath),JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
    if(!prepareOnly) {
      assertInstalledChromePinsEqual(qualified.pin,await inspectInstalledChromePin());
      receipt.launchHostPreflight=await inspectStressHostMemory();assert.equal(receipt.launchHostPreflight.safeToStart,true);
      const environment={...wrapper.env,WITHIN_MPEG2_SPLIT_CANDIDATE_DIR:path.basename(candidate.directory),WRANGLER_SEND_METRICS:"false",NEXT_TELEMETRY_DISABLED:"1"};
      buildStarted=true;
      await exec(process.execPath,["scripts/build-composited-handoff.mjs",stamp,"--for-browser"],{cwd:root,env:environment,windowsHide:true,timeout:180000,maxBuffer:2097152});
      const buildPath=`evidence/${stamp}-composited-handoff-build.json`,buildBytes=await read(buildPath),build=JSON.parse(buildBytes);
      assert.deepEqual(build.assets.map(({role,url,bytes,sha256})=>({role,url,bytes,sha256})),qualified.build.assets.map(({role,url,bytes,sha256})=>({role,url,bytes,sha256})));
      receipt.build={path:buildPath,sha256:sha(buildBytes)};
      assertInstalledChromePinsEqual(qualified.pin,await inspectInstalledChromePin());
      receipt.launchHostPreflight=await inspectStressHostMemory();assert.equal(receipt.launchHostPreflight.safeToStart,true);
      const child=spawn(process.execPath,[path.join(wrapper.directory,"probe.mjs")],{cwd:root,env:environment,windowsHide:true,stdio:["ignore","pipe","pipe"]});
      receipt.driverSpawned=Number.isSafeInteger(child.pid)&&child.pid>0;
      driverClosed=false;const stdout=boundedTail(),stderr=boundedTail();
      child.stdout.on("data",bytes=>{stdout.append(bytes);process.stdout.write(bytes);});child.stderr.on("data",bytes=>{stderr.append(bytes);process.stderr.write(bytes);});
      const closed=new Promise(resolve=>{child.once("error",error=>resolve({code:null,signal:null,error:String(error).slice(0,2048)}));child.once("close",(code,signal)=>resolve({code,signal,error:null}));});
      try {
        receipt.driverIdentity=await queryReliableProcessIdentity(child.pid);assert.ok(receipt.driverIdentity&&receipt.driverIdentity.parentPid===process.pid);
        receipt.executions=1;receipt.status="full-driver-launched-not-acceptance";
        await writeFile(path.join(root,livePath),JSON.stringify(receipt,null,2)+"\n");
        console.log(JSON.stringify({livePath,driverIdentity:receipt.driverIdentity,sourceArchive:receipt.sourceArchive.path}));
      }finally {receipt.driverExit=await closed;driverClosed=true;receipt.stdout=stdout.snapshot();receipt.stderr=stderr.snapshot();}
      receipt.driverAbsent=await observeOwnedProcessExit(receipt.driverIdentity);assert.equal(receipt.driverAbsent.status,"owned-identity-absent");
      const reports=(await readdir(path.join(root,"outputs/reports"))).filter(file=>file.endsWith("-private-mpeg2-updated-chrome-full-native-100ms.json"));
      const matches=[];
      for(const name of reports){const file=path.join(root,"outputs/reports",name);const row=JSON.parse(await readFile(file));
        if(row.ownedLaunches?.some(item=>item.identity.parentPid===receipt.driverIdentity.pid))matches.push({file,row});}
      assert.equal(matches.length,1,"Exactly one report for this actual driver birth");
      const {file,row}=matches[0];assert.deepEqual(row.sourceHashes,snapshot.pins);
      for(const launch of row.ownedLaunches)assert.equal((await observeOwnedProcessExit(launch.identity)).status,"owned-identity-absent");
      const raw=await readFile(file);assert.ok(raw.length<=33554432);const zipped=gzipSync(raw,{level:9});assert.deepEqual(gunzipSync(zipped),raw);
      const reportFile=`outputs/reports/${stamp}-updated-chrome-full-report.json.gz`;await writeFile(path.join(root,reportFile),zipped,{flag:"wx"});
      receipt.report={path:reportFile,bytes:zipped.length,sha256:sha(zipped),restoredBytes:raw.length,restoredSha256:sha(raw),status:row.status,
        completedRuns:row.runs.length,failure:row.failure,cleanup:row.cleanup};await rm(file);
      assert.equal(receipt.driverExit.code,0);assert.equal(row.failure,null);assert.equal(row.status,"passed-private-protected-session");assert.equal(row.runs.length,3);
    }
  }catch(error){receipt.failure={name:error.name,message:String(error.message).slice(0,8192),code:error.code??null,signal:error.signal??null};process.exitCode=1;}
  finally {
    const attempt=async action=>{try{await action();}catch(error){receipt.cleanupErrors.push({name:error.name,message:String(error.message).slice(0,8192)});process.exitCode=1;}};
    await attempt(async()=>{
      assert.ok(driverClosed,"Never restore or delete under a live driver");
      if(receipt.driverIdentity){receipt.driverAbsent=await observeOwnedProcessExit(receipt.driverIdentity);assert.equal(receipt.driverAbsent.status,"owned-identity-absent");}
      await verifyStoppedTree();
      if(buildStarted)await exec(process.execPath,["node_modules/vinext/dist/cli.js","build"],{cwd:root,env:wrapper.env,windowsHide:true,timeout:180000,maxBuffer:2097152});
      await normal();receipt.productionRestored=true;
    });
    await attempt(async()=>{assert.ok(driverClosed&&receipt.productionRestored);if(candidate)await candidate.close();receipt.candidateRemoved=true;});
    await attempt(async()=>{assert.ok(driverClosed&&receipt.productionRestored);await wrapper.close();receipt.wrapperRemoved=true;});
    await attempt(async()=>{receipt.protectedAfter=await protectedSource();assert.deepEqual(receipt.protectedAfter,protectedBefore);});
    await attempt(async()=>{receipt.browserPinAfter=await inspectInstalledChromePin();assertInstalledChromePinsEqual(qualified.pin,receipt.browserPinAfter);});
    await attempt(async()=>{receipt.nativeQualificationAfter=(await verifyThreadValidatorQualification(root)).reference;assert.deepEqual(receipt.nativeQualificationAfter,native.reference);});
    await attempt(async()=>{const post=await captureUpdatedFullSources(root,Object.keys(snapshot.pins));assert.deepEqual(post,snapshot);receipt.postSourcePins=post.pins;});
    receipt.finishedAt=new Date().toISOString();receipt.status=receipt.failure||receipt.cleanupErrors.length?"failed-not-accepted":prepareOnly?"prepared-not-executed":"three-full-runs-completed-pending-independent-audit";
    await writeFile(path.join(root,terminalPath),JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
    console.log(JSON.stringify({terminalPath,status:receipt.status,failure:receipt.failure,cleanupErrors:receipt.cleanupErrors}));
  }
}
