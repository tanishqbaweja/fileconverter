// Verify code artifacts only. Never runs a renderer or reads a conversion input.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { unzipSync } from "fflate";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { filterRegionPatch } from "../images/resvg-source/filter-region-patch.mjs";
import { renderContextPatch } from "../images/resvg-source/render-context-patch.mjs";
import { definedWasmMemories,requireExplicitWasmMaximum } from "../images/resvg-source/memory-contract.mjs";
import { compareStaticAbi,publishedSha256 } from "../images/resvg-source/postprocess-contract.mjs";
const contextVariant=process.argv[2]==="--context";assert.ok(process.argv.length===2||(process.argv.length===3&&contextVariant));
const root=path.resolve(import.meta.dirname,".."),runId=contextVariant?40742766594:40712501519,headSha=contextVariant?"1d6dd07d5d321618982e55ae632902c54ba6691c":"82ec7fff1d01a82ca0c80d3ee38c5a272392a246";
const rawPinFile=contextVariant?"images/resvg-source/filter-context-raw-input.json":"images/resvg-source/filter-region-raw-input.json";
const execute=promisify(execFile),stamp=new Date().toISOString().replaceAll(/[:.]/g,"-");
const report={schemaVersion:1,runId,sourceHead:headSha,contextVariant,startedAt:new Date().toISOString(),sourcePins:{},failures:[],
  rendererExecuted:false,protectedOriginalAccessed:false,localBinaryCopiesRetained:false,browserAcceptance:false,wholeGoalComplete:false};
let runtime;
try{
  for(const file of ["scripts/inspect-svg-filter-processed.mjs","images/resvg-source/filter-region-patch.mjs",rawPinFile,
    "images/resvg-source/postprocess-filter-region-source.mjs","images/resvg-source/filter-postprocess-recipe.mjs"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  if(contextVariant)for(const file of ["images/resvg-source/render-context-patch.mjs","images/resvg-source/context-postprocess-recipe.mjs"])
    report.sourcePins[file]=sha(await readFile(path.join(root,file)));
  const rawPin=JSON.parse(await readFile(path.join(root,rawPinFile)));
  runtime=await createOwnedRuntimeScratch("svg-filter-processed-");
  const gh=async(args,maxBuffer=65536)=>(await execute(process.env.WITHIN_GH_EXECUTABLE??"gh",args,
    {cwd:root,env:{...runtime.env,GH_PROMPT_DISABLED:"true"},windowsHide:true,timeout:60000,maxBuffer,encoding:"buffer"})).stdout;
  const list=JSON.parse((await gh(["api",`repos/tanishqbaweja/fileconverter/actions/runs/${runId}/artifacts`])).toString());
  assert.ok(list.total_count>0&&list.total_count<=16);
  const matches=list.artifacts.filter(row=>row.name===`svg-filter-${contextVariant?"context":"region"}-processed-${runId}`);assert.equal(matches.length,1);
  const artifact=matches[0];assert.equal(artifact.expired,false);assert.equal(artifact.workflow_run.id,runId);assert.equal(artifact.workflow_run.head_sha,headSha);
  assert.ok(Number.isSafeInteger(artifact.id)&&artifact.id>0);
  const zip=await gh(["api",`repos/tanishqbaweja/fileconverter/actions/artifacts/${artifact.id}/zip`],4194304);
  report.artifact={id:artifact.id,bytes:zip.length,sha256:sha(zip),advertisedDigest:artifact.digest,expiresAt:artifact.expires_at};
  assert.equal(artifact.digest,"sha256:"+sha(zip));
  const stem=`resvg-source-processed-repeat-${runId}`,names=[`resvg-filter-${contextVariant?"context-":""}processed-owner-${runId}.json`,stem+".json",stem+".wasm",stem+".mjs"],seen=new Set();
  const members=unzipSync(zip,{filter:entry=>{assert.ok(names.includes(entry.name));assert.equal(seen.has(entry.name),false);seen.add(entry.name);
    assert.ok(entry.originalSize>0&&entry.originalSize<=(entry.name.endsWith(".wasm")?16777216:262144));return true;}});
  assert.deepEqual(Object.keys(members).sort(),[...names].sort());
  const owner=JSON.parse(Buffer.from(members[names[0]]).toString()),receipt=JSON.parse(Buffer.from(members[names[1]]).toString());
  const wasm=Buffer.from(members[names[2]]),glue=Buffer.from(members[names[3]]);
  assert.equal(owner.status,contextVariant?"two-pinned-context-source-postprocessing-passes-byte-identical-not-browser-acceptance":"two-pinned-filter-source-postprocessing-passes-byte-identical-not-browser-acceptance");
  assert.equal(owner.ownedOwnerScratchRemoved,true);assert.deepEqual(owner.failures,[]);assert.equal(owner.processedReceipt.sha256,sha(members[names[1]]));
  assert.equal(receipt.executedHead,headSha);assert.equal(receipt.status,"repeated-source-and-processed-private-candidate-byte-identical-before-browser-acceptance");
  assert.equal(receipt.ownedScratchRemoved,true);assert.equal(receipt.publicEngineUnchanged,true);assert.deepEqual(receipt.failures,[]);
  assert.equal(receipt.twoSourceBuildReceiptsAndRawEqualityVerified,true);assert.equal(receipt.processedWasmAndGlueByteIdentical,true);
  assert.equal(receipt.filterRegionPatch.patchedSha256,filterRegionPatch.patchedSha256);assert.deepEqual(receipt.inputPin,rawPin);
  if(contextVariant){assert.equal(receipt.renderContextPatch.patchedSha256,renderContextPatch.patchedSha256);assert.equal(receipt.sourceContextCoordinatesChanged,true);}
  assert.equal(receipt.variants.length,2);
  for(const row of receipt.variants){assert.equal(row.boundedSha256,sha(wasm));assert.equal(row.glueSha256,sha(glue));}
  assert.deepEqual(owner.candidate,receipt.candidate);assert.equal(receipt.candidate.wasmSha256,sha(wasm));assert.equal(receipt.candidate.glueSha256,sha(glue));
  report.memory=definedWasmMemories(wasm);requireExplicitWasmMaximum(report.memory,100663296);
  const published=await readFile(path.join(root,"public/engines/svg/resvg.wasm"));assert.equal(sha(published),publishedSha256);
  report.staticAbi=compareStaticAbi(published,wasm);assert.equal(report.staticAbi.namesAndKindsEqual,true);
  report.glueMatchesPriorPrivateCandidate=sha(glue)==="91a086534d643127d38a12726f8c65adfb398877be6bb4d8212d358b1b1fd923";
  assert.equal(report.glueMatchesPriorPrivateCandidate,true,"Changed binding needs separate compatibility review before browser qualification");
  report.inputPin={schemaVersion:1,runId,headSha,artifactId:artifact.id,artifactBytes:zip.length,artifactSha256:sha(zip),
    receiptMember:names[1],receiptBytes:members[names[1]].length,receiptSha256:sha(members[names[1]]),
    ownerReceiptMember:names[0],ownerReceiptBytes:members[names[0]].length,ownerReceiptSha256:sha(members[names[0]]),
    wasmMember:names[2],wasmBytes:wasm.length,wasmSha256:sha(wasm),glueMember:names[3],glueBytes:glue.length,glueSha256:sha(glue),
    experimentalMaximumBytes:100663296,sourceRepeatPin:rawPinFile,filterModulePatchedSha256:filterRegionPatch.patchedSha256,
    kind:contextVariant?"two-fresh-context-source-builds-and-two-pinned-postprocessors-byte-identical-private-candidate-not-browser-qualified":"two-fresh-filter-source-builds-and-two-pinned-postprocessors-byte-identical-private-candidate-not-browser-qualified"};
  if(contextVariant)report.inputPin.renderContextPatchedSha256=renderContextPatch.patchedSha256;
  report.status="verified-source-patched-private-capped-Wasm-and-binding-not-browser-acceptance";
}catch(error){report.status="failed-filter-processed-artifact-verification";report.failures.push(String(error.stack??error));process.exitCode=1;}
finally{
  try{await runtime?.close();report.ownedRuntimeRemoved=Boolean(runtime);
    for(const [file,digest]of Object.entries(report.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),digest,file);
  }catch(error){report.status="failed-filter-processed-artifact-verification";report.failures.push("Owned cleanup/source verification: "+error);process.exitCode=1;}
  report.finishedAt=new Date().toISOString();const file=path.join(root,"evidence",stamp+"-svg-filter-processed-artifact.json");
  await writeFile(file,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
  console.log(JSON.stringify({path:path.relative(root,file),status:report.status,inputPin:report.inputPin,memory:report.memory,ownedRuntimeRemoved:report.ownedRuntimeRemoved,failures:report.failures}));
}
