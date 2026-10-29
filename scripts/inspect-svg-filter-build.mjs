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
import { renderContextPatch } from "../images/resvg-source/render-context-patch.mjs";
import { filterLivenessPatch } from "../images/resvg-source/filter-liveness-patch.mjs";
import { filterPrecisionPatch } from "../images/resvg-source/filter-precision-patch.mjs";
import { premultipliedTransferPatch } from "../images/resvg-source/premultiplied-transfer-patch.mjs";
import { blurBoundaryPatch } from "../images/resvg-source/blur-boundary-patch.mjs";
import { boundaryNumericTestsSha256 } from "../images/resvg-source/blur-boundary-postprocess-recipe.mjs";
import { verifyBlurBoundaryCompileProof } from "./lib/svg-blur-boundary-proof.mjs";
const boundary=process.argv[2]==="--blur-boundary",premultiplied=boundary||process.argv[2]==="--premultiplied",precision=process.argv[2]==="--precision",liveness=premultiplied||precision||process.argv[2]==="--liveness",contextVariant=liveness||process.argv[2]==="--context";assert.ok(process.argv.length===2||(process.argv.length===3&&contextVariant));
const variant=boundary?"blur-boundary":premultiplied?"premultiplied":precision?"precision":liveness?"liveness":contextVariant?"context":"region";
const runId=boundary?40952659246:premultiplied?40842628275:precision?40834686084:liveness?40748064269:contextVariant?40741245271:40709137070,headSha=boundary?"7a60933d4a3c82ccac8fa8d502cd2dabc7c670eb":premultiplied?"96a4a09a39989200282444076caca508314c1f74":precision?"fdd7eaf17f5239712c1b1aed1cbbdc293a09d9a5":liveness?"0d0fc32d3a32f50afe690909f036640e82849055":contextVariant?"e98056612e2f82d97cbc4ea4ed7289903b42bb22":"bb79bc0c477c8fdde59158376590bfe8c9ace9b2",root=path.resolve(import.meta.dirname,"..");
const stamp=new Date().toISOString().replaceAll(/[:.]/g,"-"),execute=promisify(execFile);
const report={schemaVersion:1,startedAt:new Date().toISOString(),runId,sourceHead:headSha,contextVariant,liveness,precision,premultiplied,boundary,sourcePins:{},failures:[],
  rendererExecuted:false,protectedOriginalAccessed:false,localBinaryCopiesRetained:false,browserAcceptance:false,wholeGoalComplete:false};
let runtime;
try{
  for(const file of ["scripts/inspect-svg-filter-build.mjs","images/resvg-source/filter-region-patch.mjs","images/resvg-source/filter-build-recipe.mjs","images/resvg-source/reproduce-filter-region-source.mjs"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(contextVariant)for(const file of ["images/resvg-source/render-context-patch.mjs","images/resvg-source/context-build-recipe.mjs","images/resvg-source/reproduce-filter-context-source.mjs"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(liveness)for(const file of ["images/resvg-source/filter-liveness-patch.mjs","images/resvg-source/liveness-build-recipe.mjs"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(precision)for(const file of ["images/resvg-source/filter-precision-patch.mjs","images/resvg-source/precision-build-recipe.mjs","images/resvg-source/filter-precision-kernel.rs"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(premultiplied)for(const file of ["images/resvg-source/premultiplied-transfer-patch.mjs","images/resvg-source/premultiplied-build-recipe.mjs","images/resvg-source/premultiplied-transfer-kernel.rs"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(boundary)for(const file of ["scripts/lib/svg-blur-boundary-proof.mjs","images/resvg-source/blur-boundary-patch.mjs","images/resvg-source/blur-boundary-build-recipe.mjs","images/resvg-source/blur-boundary-postprocess-recipe.mjs","images/resvg-source/blur-boundary-kernel-tests.rs"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  runtime=await createOwnedRuntimeScratch("svg-filter-artifact-");
  const gh=async(args,maximum=65536)=>{
    const {stdout}=await execute(process.env.WITHIN_GH_EXECUTABLE??"gh",args,{cwd:root,env:{...runtime.env,GH_PROMPT_DISABLED:"true"},windowsHide:true,timeout:60000,maxBuffer:maximum,encoding:"buffer"});
    return stdout;
  };
  if(boundary){
    const hosted=JSON.parse((await gh(["api",`repos/tanishqbaweja/fileconverter/actions/runs/${runId}`])).toString());
    assert.equal(hosted.id,runId);assert.equal(hosted.head_sha,headSha);assert.equal(hosted.status,"completed");assert.equal(hosted.conclusion,"success");
    assert.equal(hosted.path,".github/workflows/svg-source-blur-boundary.yml");
    report.hostedRun={id:runId,headSha,status:hosted.status,conclusion:hosted.conclusion,path:hosted.path};
  }
  const list=JSON.parse((await gh(["api",`repos/tanishqbaweja/fileconverter/actions/runs/${runId}/artifacts`])).toString());
  assert.ok(list.total_count>0&&list.total_count<=16);
  const matches=list.artifacts.filter(row=>row.name===`svg-filter-${variant}-source-${runId}`);assert.equal(matches.length,1);
  const artifact=matches[0];assert.equal(artifact.expired,false);assert.equal(artifact.workflow_run.id,runId);assert.equal(artifact.workflow_run.head_sha,headSha);
  assert.ok(Number.isSafeInteger(artifact.id)&&artifact.id>0);
  report.artifact={id:artifact.id,name:artifact.name,advertisedDigest:artifact.digest,expiresAt:artifact.expires_at};
  const zip=await gh(["api",`repos/tanishqbaweja/fileconverter/actions/artifacts/${artifact.id}/zip`],4194304);
  report.artifact.bytes=zip.length;report.artifact.sha256=sha(zip);
  assert.equal(artifact.digest,"sha256:"+sha(zip));
  const names=[`resvg-filter-${variant}-owner-${runId}.json`,`resvg-source-repeat-${runId}.json`,
    `resvg-source-compile-${runId}1.json`,`resvg-source-compile-${runId}1.lock`,`resvg-source-compile-${runId}1.wasm`,`resvg-source-compile-${runId}2.json`];
  const seen=new Set();
  const members=unzipSync(zip,{filter:entry=>{assert.ok(names.includes(entry.name),"Unexpected artifact member: "+entry.name);
    assert.equal(seen.has(entry.name),false,"No duplicate artifact members");seen.add(entry.name);
    assert.ok(entry.originalSize>0&&entry.originalSize<=(entry.name.endsWith(".wasm")?16777216:262144));return true;}});
  assert.deepEqual(Object.keys(members).sort(),[...names].sort());
  const json=name=>JSON.parse(Buffer.from(members[name]).toString()),owner=json(names[0]),summary=json(names[1]),raw=Buffer.from(members[names[4]]);
  assert.equal(owner.status,`two-fresh-filter-${variant}-source-builds-verified-not-browser-acceptance`);
  assert.equal(owner.rawByteEquality,true);assert.equal(owner.ownedOwnerScratchRemoved,true);assert.deepEqual(owner.failures,[]);
  assert.equal(owner.rawRepeatReceipt.sha256,sha(members[names[1]]));
  assert.equal(summary.status,`two-fresh-private-filter-${variant}-source-builds-byte-identical-not-browser-acceptance`);
  if(contextVariant)assert.equal(summary.renderContextPatch.patchedSha256,renderContextPatch.patchedSha256);
  if(liveness)assert.equal(summary.filterLivenessPatch.patchedSha256,filterLivenessPatch.patchedSha256);
  if(precision)assert.equal(summary.filterPrecisionPatch.patchedSha256,filterPrecisionPatch.patchedSha256);
  if(premultiplied)assert.equal(summary.premultipliedTransferPatch.patchedSha256,premultipliedTransferPatch.patchedSha256);
  if(boundary){assert.equal(summary.blurBoundaryPatch.patchedSha256,blurBoundaryPatch.patchedSha256);assert.equal(summary.blurBoundaryPatch.nativeSourceRecipeIntegrated,true);}
  assert.equal(summary.rawBytesEqual,true);assert.equal(summary.publicEngineUnchanged,true);assert.equal(summary.ownedDriverScratchRemoved,true);
  assert.equal(summary.secondOwnedRawAndLockRemovedAfterExactVerification,true);assert.deepEqual(summary.failures,[]);
  assert.equal(summary.builds.length,2);assert.notEqual(summary.builds[0].runtimeFromReceipt,summary.builds[1].runtimeFromReceipt);
  report.rawWasm=inspectRawWasm(raw);assert.notEqual(report.rawWasm.sha256,"c6014e1c42f7d88c92e858084e187e058451d480fa49e93487af9dc9a9ee5c09");
  if(contextVariant)assert.notEqual(report.rawWasm.sha256,"424e3a7cbb5de3bed809b66c49c575d6f8fb788f923fdd69a01e985412ff4321");
  if(liveness)assert.notEqual(report.rawWasm.sha256,"f2d0d3ffc09fb7384e2c50ad8a332e10064089fa349bf92ea97b1222c6c6fa71");
  if(precision)assert.notEqual(report.rawWasm.sha256,"1d67f2f0bf4aa89759ab15db23737e79a34156ef5ee6acf82557dcdc58d1f1a3");
  if(premultiplied){assert.notEqual(report.rawWasm.sha256,"1d67f2f0bf4aa89759ab15db23737e79a34156ef5ee6acf82557dcdc58d1f1a3");assert.notEqual(report.rawWasm.sha256,"86e92aaefdb94cc56eb11df85205e92d91a2e9d5b2cef1999e6580aa0c9ba25d");}
  if(boundary)assert.notEqual(report.rawWasm.sha256,"1df4c1453ea928d7c29e2cc9b06d3cb708d4a32438c524dd9e5e9517080e0f1b");
  assert.equal(sha(members[names[3]]),bytesRepair.repairedLockSha256);
  report.compileProofs=[];
  for(const name of [names[2],names[5]]){
    const row=json(name);assert.equal(row.executedHead,headSha);assert.equal(row.sourceCompilationSucceeded,true);assert.equal(row.ownedScratchRemoved,true);
    assert.deepEqual(row.failures,[]);assert.equal(row.rustcVersion,compileContract.rustcVersion);
    assert.equal(row.rawWasm.sha256,sha(raw));assert.equal(row.lock.sha256,bytesRepair.repairedLockSha256);
    assert.equal(row.filterRegionPatch.originalSha256,filterRegionPatch.originalSha256);assert.equal(row.filterRegionPatch.patchedSha256,filterRegionPatch.patchedSha256);
    assert.equal(row.filterRegionPatch.onlyOwnedFreshDependencyCheckoutChanged,true);assert.equal(row.filterRegionPatch.gitHead,filterRegionPatch.revision);
    if(contextVariant){assert.equal(row.renderContextPatch.patchedSha256,renderContextPatch.patchedSha256);assert.equal(row.renderContextPatch.onlyOwnedFreshDependencyCheckoutChanged,true);}
    if(liveness){assert.equal(row.filterLivenessPatch.patchedSha256,filterLivenessPatch.patchedSha256);assert.equal(row.filterLivenessPatch.onlyOwnedFreshDependencyCheckoutChanged,true);}
    if(precision){
      assert.equal(row.filterPrecisionPatch.originalSha256,filterLivenessPatch.patchedSha256);
      assert.equal(row.filterPrecisionPatch.patchedSha256,filterPrecisionPatch.patchedSha256);
      assert.equal(row.filterPrecisionPatch.kernelSha256,filterPrecisionPatch.kernelSha256);
      assert.equal(row.filterPrecisionPatch.onlyOwnedFreshDependencyCheckoutChanged,true);
      assert.equal(row.filterPrecisionKernelTests.passed,4);assert.equal(row.filterPrecisionKernelTests.kernelSha256,filterPrecisionPatch.kernelSha256);
      assert.equal(row.filterPrecisionKernelTests.compiler,compileContract.rustcVersion);
    }
    if(premultiplied){
      assert.equal(row.premultipliedTransferPatch.originalSha256,filterLivenessPatch.patchedSha256);
      assert.equal(row.premultipliedTransferPatch.patchedSha256,premultipliedTransferPatch.patchedSha256);
      assert.equal(row.premultipliedTransferPatch.kernelSha256,premultipliedTransferPatch.kernelSha256);
      assert.equal(row.premultipliedTransferPatch.onlyOwnedFreshDependencyCheckoutChanged,true);
      assert.equal(row.premultipliedTransferPatch.fullViewportFloatAccumulatorIntroduced,false);
      assert.equal(row.premultipliedTransferPatch.additionalTablePayloadBytes,131072);
      assert.equal(row.premultipliedKernelTests.passed,4);assert.equal(row.premultipliedKernelTests.kernelSha256,premultipliedTransferPatch.kernelSha256);
      assert.equal(row.premultipliedKernelTests.compiler,compileContract.rustcVersion);
    }
    if(boundary)verifyBlurBoundaryCompileProof(row);
    assert.deepEqual(row.commands.at(-1).args,[...compileContract.command]);assert.equal(row.commands.at(-1).exitCode,0);assert.equal(row.commands.at(-1).signal,null);
    report.compileProofs.push({member:name,startedAt:row.startedAt,finishedAt:row.finishedAt,filterRegionPatch:row.filterRegionPatch,renderContextPatch:row.renderContextPatch??null,filterLivenessPatch:row.filterLivenessPatch??null,filterPrecisionPatch:row.filterPrecisionPatch??null,filterPrecisionKernelTests:row.filterPrecisionKernelTests??null,premultipliedTransferPatch:row.premultipliedTransferPatch??null,premultipliedKernelTests:row.premultipliedKernelTests??null,compiler:row.rustcVersion,lockSha256:row.lock.sha256,rawSha256:row.rawWasm.sha256,ownedScratchRemoved:true});
    if(boundary)Object.assign(report.compileProofs.at(-1),{blurBoundaryPatch:row.blurBoundaryPatch,blurBoundaryKernelTests:row.blurBoundaryKernelTests});
  }
  report.inputPin={schemaVersion:1,runId,headSha,artifactId:artifact.id,artifactBytes:zip.length,artifactSha256:sha(zip),
    members:Object.entries(members).map(([name,bytes])=>({name,bytes:bytes.length,sha256:sha(bytes)})).sort((a,b)=>a.name.localeCompare(b.name)),
    summaryMember:names[1],wasmMember:names[4],lockMember:names[3],compilerReceiptMembers:[names[2],names[5]],ownerReceiptMember:names[0],
    kind:`two-fresh-filter-${variant}-source-builds-byte-identical-before-postprocessing`};
  if(contextVariant)report.inputPin.renderContextPatchedSha256=renderContextPatch.patchedSha256;
  if(liveness)report.inputPin.filterLivenessPatchedSha256=filterLivenessPatch.patchedSha256;
  if(precision){report.inputPin.filterPrecisionPatchedSha256=filterPrecisionPatch.patchedSha256;report.inputPin.filterPrecisionKernelSha256=filterPrecisionPatch.kernelSha256;}
  if(premultiplied){report.inputPin.premultipliedTransferPatchedSha256=premultipliedTransferPatch.patchedSha256;report.inputPin.premultipliedKernelSha256=premultipliedTransferPatch.kernelSha256;}
  if(boundary){report.inputPin.blurBoundaryPatchedSha256=blurBoundaryPatch.patchedSha256;report.inputPin.blurBoundaryNumericTestsSha256=boundaryNumericTestsSha256;}
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
