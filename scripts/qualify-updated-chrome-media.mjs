// Real headless production-browser qualification after Chrome changed. No full
// original stress acceptance follows from these deterministic four small cases.
import "./lib/reliable-readonly-preflight.mjs";
import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {createHash} from "node:crypto";
import {createReadStream} from "node:fs";
import {access,lstat,readFile,readdir,statfs,writeFile} from "node:fs/promises";
import path from "node:path";
import {promisify} from "node:util";
import {gzipSync,gunzipSync} from "node:zlib";
import {createOwnedRuntimeScratch} from "./lib/owned-runtime-scratch.mjs";
import {inspectInstalledChromePin,assertInstalledChromePinsEqual} from "./lib/installed-chrome-pin.mjs";
import {inspectStressHostMemory} from "./lib/host-memory-preflight.mjs";
import {deriveUpdatedChromeMedia} from "./lib/updated-chrome-media.mjs";
import {inspectEbmlMediaReport} from "./lib/staged-handoff-media-recipe.mjs";
import {verifyHandoffBuildAndEvents} from "./lib/composited-handoff-evidence.mjs";
import {verifyThreadValidatorQualification} from "./lib/threaded-validator-qualification.mjs";
import {observeOwnedProcessExit} from "./lib/owned-process-exit-observation.mjs";
import {sha,baselineBinding} from "./lib/stable-ui-headless-baseline-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),exec=promisify(execFile);
const args=process.argv.slice(2);assert.ok(args.length===0||(args.length===1&&args[0]==="--prepare-only"));
const prepareOnly=args.length===1,stamp=new Date().toISOString().replaceAll(/[:.]/g,"-");
process.env.WITHIN_DURATION_DRAIN_CONTROL_RECEIPT="evidence/2026-10-15T10-37-24-961Z-duration-drain-browser-control-executed-sources.json";
const parentPath="evidence/2026-10-15T17-20-01-310Z-composited-handoff-media.json",parentBytes=await read(parentPath),parent=JSON.parse(parentBytes);
assert.equal(sha(parentBytes),"1b3de340a44fec36fe1dd1386da1ed60a33551694bb099a96a427026d1fe8cac");
assert.equal(parent.failure,null);assert.deepEqual(parent.sourcePins,parent.postSourcePins);
const unpack=async record=>{
  const zip=await read(record.path);assert.equal(zip.length,record.bytes);assert.equal(sha(zip),record.sha256);
  const raw=gunzipSync(zip,{maxOutputLength:8388608});assert.equal(raw.length,record.restoredBytes);assert.equal(sha(raw),record.restoredSha256);return JSON.parse(raw);
};
const archive=await unpack(parent.generatedArchive);assert.deepEqual(archive.sourcePins,parent.sourcePins);
assert.equal(Object.keys(parent.sourcePins).length,255);
for(const [file,hash]of Object.entries(parent.sourcePins)) {
  assert.equal(sha(archive.sources[file]),hash,file);assert.equal(sha(await read(file)),hash,file);
}
const sealPath="evidence/2026-10-15T17-20-01-310Z-composited-handoff-independent-qualification.json",sealBytes=await read(sealPath);
assert.equal(sha(sealBytes),"9701b6777707e96cbffee1dee9b383dfb21835e9abd286f258907559f65e7bf7");
const seal=JSON.parse(sealBytes),supplementBytes=await read(seal.supplemental.path);
assert.equal(sha(supplementBytes),seal.supplemental.sha256);
const supplement=JSON.parse(supplementBytes),supplementArchive=await unpack(supplement.archive);
assert.equal(supplement.failure,null);assert.equal(supplement.supplemental.maximumFiles,128);
assert.deepEqual(supplement.sourcePins,supplement.postSourcePins);assert.deepEqual(supplementArchive.sourcePins,supplement.sourcePins);
const oldBuildBytes=await read(seal.build.path);assert.equal(sha(oldBuildBytes),seal.build.sha256);
const oldBuild=JSON.parse(oldBuildBytes),buildArchive=await unpack(oldBuild.sourceArchive);
assert.deepEqual(oldBuild.sourcePins,oldBuild.postSourcePins);assert.deepEqual(buildArchive.sourcePins,oldBuild.sourcePins);
const sourcePins={...parent.sourcePins},preimages={};
for(const [record,restored]of [[supplement,supplementArchive],[oldBuild,buildArchive]])for(const [file,hash]of Object.entries(record.sourcePins)){
  assert.equal(sha(Buffer.from(restored.preimages[file],"base64")),hash,file);assert.equal(sha(await read(file)),hash,file);
  if(Object.hasOwn(sourcePins,file))assert.equal(sourcePins[file],hash,file);sourcePins[file]=hash;
}
assert.equal(Object.keys(sourcePins).length,367);
const newFiles=["scripts/qualify-updated-chrome-media.mjs","scripts/lib/updated-chrome-media.mjs","tests/updated-chrome-media.test.mjs"];
for(const file of newFiles){const bytes=await read(file);sourcePins[file]=sha(bytes);preimages[file]=bytes.toString("base64");}
const native=await verifyThreadValidatorQualification(root),pin=await inspectInstalledChromePin();
const host=await inspectStressHostMemory();assert.equal(host.safeToStart,true);
const disk=await statfs(root);assert.ok(disk.bavail*disk.bsize>=32*1024**3);
const sourceHash=async()=>{
  const file=path.join(root,"test.mkv"),row=await lstat(file);assert.equal(row.size,2958573265);assert.ok(row.isFile()&&!row.isSymbolicLink());
  const hash=createHash("sha256");for await(const chunk of createReadStream(file,{highWaterMark:1048576}))hash.update(chunk);
  const sha256=hash.digest("hex");assert.equal(sha256,"31f36695b5b44c62125a9e4264e84dc085accd21c02cc3487aae597f54b9db34");return {bytes:row.size,sha256};
};
const normal=async()=>{
  assert.equal(sha(await read("dist/client"+baselineBinding.url)),baselineBinding.sha256);
  assert.equal(sha(await read("dist/client/assets/index-CIzbeB0A.css")),"f78f673c089ceb0dcfd1a885ff03e2a43984d851cfbe1d915e9a773a45c747dd");
};
await normal();const protectedBefore=await sourceHash();
const runtime=await createOwnedRuntimeScratch("packet-cache-media-");
const reportPath=`evidence/${stamp}-updated-chrome-media.json`;
const receipt={status:"preparing-not-accepted",recordedAt:new Date().toISOString(),prepareOnly,
  parent:{path:parentPath,sha256:sha(parentBytes),generatedArchive:parent.generatedArchive,
    seal:{path:sealPath,sha256:sha(sealBytes)},supplemental:seal.supplemental,build:seal.build},
  sourcePins,postSourcePins:null,browserPinBefore:pin,browserPinAfter:null,nativeQualification:native.reference,
  hostPreflight:host,diskFreeBytes:disk.bavail*disk.bsize,protectedBefore,protectedAfter:null,
  runtimeDirectory:runtime.directory,runtimeRemoved:false,executions:0,failure:null,cleanupErrors:[],
  report:null,analysis:null,publicAcceptance:false,fullOriginalAcceptance:false,completeChromiumMemoryAcceptance:false};
let driverExited=false,helpersVerified=false;
const verifyHelpers=async()=>{
  const helpers=JSON.parse(await read(`outputs/reports/${stamp}-single-idle-golden-launch-identities.json`));
  assert.equal(helpers.runtimeAbsent,true);
  for(const row of helpers.launchRecords){
    assert.equal(row.absence.status,"owned-identity-absent");
    assert.equal((await observeOwnedProcessExit(row.identity)).status,"owned-identity-absent");
  }
  await assert.rejects(access(helpers.runtime),{code:"ENOENT"});receipt.helpers=helpers;
  const fixtureCleanup=JSON.parse(await read(`outputs/reports/${stamp}-journaled-realloc-fixture-cleanup.json`));
  assert.equal(fixtureCleanup.ownedDirectoryAbsent,true);receipt.fixtureCleanup=fixtureCleanup;
  helpersVerified=true;
};
try {
  const recipe=deriveUpdatedChromeMedia(archive.generated,root,runtime.directory,stamp,pin),generated=recipe.generated;
  receipt.derivative={changes:recipe.changes,onlyBrowserIdentityAndOwnedPathsChanged:true,conversionAndValidationGatesChanged:false};
  const candidate=archive.generated.composition;
  assert.equal(candidate.manifest.aggregateWasmMemoryBytes,50331648);assert.equal(candidate.manifest.allowMemoryGrowth,false);
  for(const [file,row]of Object.entries(candidate.files)) {
    assert.equal(path.basename(file),file);
    const bytes=row.path==="derived-at-runtime"?Buffer.from(archive.generated.ebmlGlueRecipe.generated):await read(row.path);
    assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256,file);
    assert.equal(candidate.manifest.artifacts[file],row.sha256);
    await writeFile(path.join(runtime.directory,file),bytes,{flag:"wx"});
  }
  await writeFile(path.join(runtime.directory,"build-manifest.json"),JSON.stringify(candidate.manifest,null,2)+"\n",{flag:"wx"});
  for(const [file,key]of [["stage.mjs","stage"],["candidate.spec.ts","spec"],["playwright.config.mjs","config"],["driver.mjs","driver"]])
    await writeFile(path.join(runtime.directory,file),generated[key],{flag:"wx"});
  const sealed=Buffer.from(JSON.stringify({parent:receipt.parent,sourcePins,preimages,recipe}));assert.ok(sealed.length<=2097152);
  const zip=gzipSync(sealed,{level:9});assert.deepEqual(gunzipSync(zip),sealed);
  const file=`outputs/reports/${stamp}-updated-chrome-media-sources.json.gz`;
  await writeFile(path.join(root,file),zip,{flag:"wx"});receipt.sourceArchive={path:file,bytes:zip.length,sha256:sha(zip),restoredBytes:sealed.length,restoredSha256:sha(sealed)};
  for(const file of ["stage.mjs","playwright.config.mjs","driver.mjs"])
    await exec(process.execPath,["--check",path.join(runtime.directory,file)],{cwd:root,env:runtime.env,windowsHide:true,maxBuffer:16384});
  await writeFile(path.join(root,reportPath),JSON.stringify(receipt,null,2)+"\n",{flag:"wx"});
  if(!prepareOnly) {
    const launchHost=await inspectStressHostMemory();assert.equal(launchHost.safeToStart,true);receipt.launchHostPreflight=launchHost;
    assertInstalledChromePinsEqual(pin,await inspectInstalledChromePin());
    receipt.executions=1;const begin=Date.now();
    try{const result=await exec(process.execPath,[path.join(runtime.directory,"driver.mjs")],
      {cwd:root,env:{...runtime.env,WITHIN_MPEG2_SPLIT_CANDIDATE_DIR:generated.candidateName},windowsHide:true,maxBuffer:2097152});
      receipt.driver={elapsedMs:Date.now()-begin,stdoutTail:result.stdout.slice(-8192),stderrTail:result.stderr.slice(-8192)};
    }finally{driverExited=true;}
    await verifyHelpers();
    const files=(await readdir(path.join(root,"output/playwright"))).filter(file=>file.endsWith(`-${generated.candidateName}-direct-artwork.json`));
    assert.equal(files.length,1);const raw=await read(`output/playwright/${files[0]}`),report=JSON.parse(raw);
    const baseline=JSON.parse(await read(parent.baseline.path)),build=JSON.parse(await read(parent.build.path));
    assert.equal(sha(await read(parent.baseline.path)),parent.baseline.sha256);assert.equal(sha(await read(parent.build.path)),parent.build.sha256);
    receipt.analysis=await inspectEbmlMediaReport(report,baseline.reports[0].report,build);
    const buildPath=`evidence/${stamp}-composited-handoff-build.json`,actualBuild=JSON.parse(await read(buildPath));
    receipt.build={path:buildPath,sha256:sha(await read(buildPath))};
    assert.deepEqual(actualBuild.assets.map(({role,url,bytes,sha256})=>({role,url,bytes,sha256})),
      oldBuild.assets.map(({role,url,bytes,sha256})=>({role,url,bytes,sha256})),"Same compiled browser code; only runtime browser changed");
    receipt.lifecycle=verifyHandoffBuildAndEvents(actualBuild,generated,report);
    const versions=report.rows.filter(row=>row.kind==="actual-runtime-browser-version");assert.equal(versions.length,4);
    for(const row of versions)assert.equal(row.version,pin.version);
    const prior=await unpack(parent.report.archive);
    const outputRows=report.rows.filter(row=>row.kind==="independent-packet-order-proof");
    const priorRows=prior.rows.filter(row=>row.kind==="independent-packet-order-proof");
    assert.equal(outputRows.length,4);assert.equal(priorRows.length,4);
    assert.deepEqual(outputRows,priorRows,"Every independent packet proof must equal the qualified original browser result");
    const compressed=gzipSync(raw,{level:9});assert.deepEqual(gunzipSync(compressed),raw);
    const reportFile=`outputs/reports/${stamp}-updated-chrome-media-report.json.gz`;
    await writeFile(path.join(root,reportFile),compressed,{flag:"wx"});
    receipt.report={path:reportFile,bytes:compressed.length,sha256:sha(compressed),restoredBytes:raw.length,restoredSha256:sha(raw)};
    // Raw report is disposable only after lossless compression and validation.
    const {rm}=await import("node:fs/promises");await rm(path.join(root,"output/playwright",files[0]));
    receipt.actualRuntimeVersions=versions;receipt.allFourPacketProofsEqualPreviousBrowser=true;
  }
}catch(error){receipt.failure={name:error.name,message:String(error.message).slice(0,8192),stdoutTail:typeof error.stdout==="string"?error.stdout.slice(-8192):null,stderrTail:typeof error.stderr==="string"?error.stderr.slice(-8192):null};process.exitCode=1;}
finally {
  try {
    if(driverExited&&!helpersVerified)await verifyHelpers();
    if(prepareOnly||helpersVerified||receipt.executions===0){await runtime.close();await assert.rejects(access(runtime.directory),{code:"ENOENT"});receipt.runtimeRemoved=true;}
    await normal();receipt.productionRestored=true;
    receipt.protectedAfter=await sourceHash();assert.deepEqual(receipt.protectedAfter,protectedBefore);
    receipt.browserPinAfter=await inspectInstalledChromePin();assertInstalledChromePinsEqual(pin,receipt.browserPinAfter);
    const after={};for(const [file,hash]of Object.entries(sourcePins)){after[file]=sha(await read(file));assert.equal(after[file],hash,file);}receipt.postSourcePins=after;
    receipt.nativeQualificationAfter=(await verifyThreadValidatorQualification(root)).reference;assert.deepEqual(receipt.nativeQualificationAfter,native.reference);
  }catch(error){receipt.cleanupErrors.push({name:error.name,message:String(error.message).slice(0,8192)});process.exitCode=1;}
  receipt.finishedAt=new Date().toISOString();
  receipt.status=receipt.failure||receipt.cleanupErrors.length?"failed-not-accepted":prepareOnly?"prepared-not-executed":"four-updated-chrome-conversions-and-recovery-passed-not-full-acceptance";
  await writeFile(path.join(root,reportPath),JSON.stringify(receipt,null,2)+"\n");
  console.log(JSON.stringify({reportPath,status:receipt.status,sourceCount:Object.keys(sourcePins).length,failure:receipt.failure,cleanupErrors:receipt.cleanupErrors}));
}
