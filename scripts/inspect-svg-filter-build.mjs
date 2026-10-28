// Read-only remote source artifact verification. No renderer or user-file access.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { unzipSync } from "fflate";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { filterRegionPatch } from "../images/resvg-source/filter-region-patch.mjs";
import { compileContract,inspectRawWasm } from "../images/resvg-source/compile-contract.mjs";
import { bytesRepair } from "../images/resvg-source/bytes-repair.mjs";
assert.equal(process.argv.length,2);
const runId=40709137070,headSha="bb79bc0c477c8fdde59158376590bfe8c9ace9b2",root=path.resolve(import.meta.dirname,"..");
const stamp=new Date().toISOString().replaceAll(/[:.]/g,"-"),execute=promisify(execFile);
const report={schemaVersion:1,startedAt:new Date().toISOString(),runId,sourceHead:headSha,sourcePins:{},failures:[],
  rendererExecuted:false,protectedOriginalAccessed:false,localBinaryCopiesRetained:false,browserAcceptance:false,wholeGoalComplete:false};
let runtime;
try{
  for(const file of ["scripts/inspect-svg-filter-build.mjs","images/resvg-source/filter-region-patch.mjs","images/resvg-source/filter-build-recipe.mjs","images/resvg-source/reproduce-filter-region-source.mjs"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  runtime=await createOwnedRuntimeScratch("svg-filter-artifact-");
  const gh=async(args,maximum=65536)=>{
    const {stdout}=await execute(process.env.WITHIN_GH_EXECUTABLE??"gh",args,{cwd:root,env:{...runtime.env,GH_PROMPT_DISABLED:"true"},windowsHide:true,timeout:60000,maxBuffer:maximum,encoding:"buffer"});
    return stdout;
  };
  const list=JSON.parse((await gh(["api",`repos/tanishqbaweja/fileconverter/actions/runs/${runId}/artifacts`])).toString());
  assert.ok(list.total_count>0&&list.total_count<=16);
  const matches=list.artifacts.filter(row=>row.name===`svg-filter-region-source-${runId}`);assert.equal(matches.length,1);
  const artifact=matches[0];assert.equal(artifact.expired,false);assert.equal(artifact.workflow_run.id,runId);assert.equal(artifact.workflow_run.head_sha,headSha);
  assert.ok(Number.isSafeInteger(artifact.id)&&artifact.id>0);
  report.artifact={id:artifact.id,name:artifact.name,advertisedDigest:artifact.digest,expiresAt:artifact.expires_at};
  const zip=await gh(["api",`repos/tanishqbaweja/fileconverter/actions/artifacts/${artifact.id}/zip`],4194304);
  report.artifact.bytes=zip.length;report.artifact.sha256=sha(zip);
  const names=[`resvg-filter-region-owner-${runId}.json`,`resvg-source-repeat-${runId}.json`,
    `resvg-source-compile-${runId}1.json`,`resvg-source-compile-${runId}1.lock`,`resvg-source-compile-${runId}1.wasm`,`resvg-source-compile-${runId}2.json`];
  const seen=new Set();
  const members=unzipSync(zip,{filter:entry=>{assert.ok(names.includes(entry.name),"Unexpected artifact member: "+entry.name);
    assert.equal(seen.has(entry.name),false,"No duplicate artifact members");seen.add(entry.name);
    assert.ok(entry.originalSize>0&&entry.originalSize<=(entry.name.endsWith(".wasm")?16777216:262144));return true;}});
  assert.deepEqual(Object.keys(members).sort(),[...names].sort());
  const json=name=>JSON.parse(Buffer.from(members[name]).toString()),owner=json(names[0]),summary=json(names[1]),raw=Buffer.from(members[names[4]]);
  assert.equal(owner.status,"two-fresh-filter-region-source-builds-verified-not-browser-acceptance");
  assert.equal(owner.rawByteEquality,true);assert.equal(owner.ownedOwnerScratchRemoved,true);assert.deepEqual(owner.failures,[]);
  assert.equal(owner.rawRepeatReceipt.sha256,sha(members[names[1]]));
  assert.equal(summary.status,"two-fresh-private-filter-region-source-builds-byte-identical-not-browser-acceptance");
  assert.equal(summary.rawBytesEqual,true);assert.equal(summary.publicEngineUnchanged,true);assert.equal(summary.ownedDriverScratchRemoved,true);
  assert.equal(summary.secondOwnedRawAndLockRemovedAfterExactVerification,true);assert.deepEqual(summary.failures,[]);
  assert.equal(summary.builds.length,2);assert.notEqual(summary.builds[0].runtimeFromReceipt,summary.builds[1].runtimeFromReceipt);
  report.rawWasm=inspectRawWasm(raw);assert.notEqual(report.rawWasm.sha256,"c6014e1c42f7d88c92e858084e187e058451d480fa49e93487af9dc9a9ee5c09");
  assert.equal(sha(members[names[3]]),bytesRepair.repairedLockSha256);
  report.compileProofs=[];
  for(const name of [names[2],names[5]]){
    const row=json(name);assert.equal(row.executedHead,headSha);assert.equal(row.sourceCompilationSucceeded,true);assert.equal(row.ownedScratchRemoved,true);
    assert.deepEqual(row.failures,[]);assert.equal(row.rustcVersion,compileContract.rustcVersion);
    assert.equal(row.rawWasm.sha256,sha(raw));assert.equal(row.lock.sha256,bytesRepair.repairedLockSha256);
    assert.equal(row.filterRegionPatch.originalSha256,filterRegionPatch.originalSha256);assert.equal(row.filterRegionPatch.patchedSha256,filterRegionPatch.patchedSha256);
    assert.equal(row.filterRegionPatch.onlyOwnedFreshDependencyCheckoutChanged,true);assert.equal(row.filterRegionPatch.gitHead,filterRegionPatch.revision);
    assert.deepEqual(row.commands.at(-1).args,[...compileContract.command]);assert.equal(row.commands.at(-1).exitCode,0);assert.equal(row.commands.at(-1).signal,null);
    report.compileProofs.push({member:name,startedAt:row.startedAt,finishedAt:row.finishedAt,filterRegionPatch:row.filterRegionPatch,compiler:row.rustcVersion,lockSha256:row.lock.sha256,rawSha256:row.rawWasm.sha256,ownedScratchRemoved:true});
  }
  report.inputPin={schemaVersion:1,runId,headSha,artifactId:artifact.id,artifactBytes:zip.length,artifactSha256:sha(zip),
    members:Object.entries(members).map(([name,bytes])=>({name,bytes:bytes.length,sha256:sha(bytes)})).sort((a,b)=>a.name.localeCompare(b.name)),
    summaryMember:names[1],wasmMember:names[4],lockMember:names[3],compilerReceiptMembers:[names[2],names[5]],ownerReceiptMember:names[0],
    kind:"two-fresh-filter-region-source-builds-byte-identical-before-postprocessing"};
  report.status="verified-two-fresh-source-patched-raw-builds-not-postprocessing-or-browser-acceptance";
}catch(error){report.status="failed-filter-source-artifact-verification";report.failures.push(String(error.stack??error));process.exitCode=1;}
finally{
  try{await runtime?.close();report.ownedRuntimeRemoved=Boolean(runtime);
    for(const [file,digest]of Object.entries(report.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),digest,file);
  }catch(error){report.status="failed-filter-source-artifact-verification";report.failures.push("Owned cleanup/source verification: "+error);process.exitCode=1;}
  report.finishedAt=new Date().toISOString();const file=path.join(root,"evidence",stamp+"-svg-filter-source-artifact.json");
  await writeFile(file,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({path:path.relative(root,file),status:report.status,rawWasm:report.rawWasm,inputPin:report.inputPin,ownedRuntimeRemoved:report.ownedRuntimeRemoved,failures:report.failures}));
}
