// Isolated bundled-runtime security/API comparison. Does not change the app graph.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access,readFile,writeFile } from "node:fs/promises";
import path from "node:path";
import { Worker } from "node:worker_threads";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { createOwnedRuntimeScratch } from "./lib/owned-runtime-scratch.mjs";
import { patchOgNodeBootstrap } from "./lib/og-node-bootstrap-patch.mjs";
const root=path.resolve(import.meta.dirname,".."),destination=path.join(root,"evidence/2026-10-29-og-security-node-asset-candidate.json");
await assert.rejects(access(destination),{code:"ENOENT"});
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
const files=["package.json","package-lock.json","scripts/check-og-security-candidate.mjs","scripts/lib/og-security-probe-worker.mjs","scripts/lib/framework-probe-fetch.mjs","scripts/lib/og-node-bootstrap-patch.mjs"];
const sourcePins=Object.fromEntries(await Promise.all(files.map(async file=>[file,sha(await readFile(path.join(root,file)))])));
const runtime=await createOwnedRuntimeScratch("og-security-candidate-");
const report={schemaVersion:1,startedAt:new Date().toISOString(),sourcePins,status:"running",cases:[],
  advisory:"https://github.com/advisories/GHSA-wx4j-mvgx-mqwp",scope:"Synthetic framework dependency runtime/source/API only; not conversion, browser memory or complete security certification",
  applicationGraphChanged:false,conversionOrMemoryAcceptance:false,securityClosure:false};
const npmCli=path.join(path.dirname(process.execPath),"node_modules/npm/bin/npm-cli.js");
const npmEnv={...runtime.env,npm_config_cache:path.join(runtime.directory,"npm-cache"),npm_config_update_notifier:"false"};
async function inspect(label,packageRoot){
  const pkgBytes=await readFile(path.join(packageRoot,"package.json")),pkg=JSON.parse(pkgBytes);
  const entry=path.join(packageRoot,"dist/index.node.js"),source=await readFile(entry,"utf8");assert.ok(Buffer.byteLength(source)<=4*1048576);
  const row={label,version:pkg.version,packageSha256:sha(pkgBytes),entryBytes:Buffer.byteLength(source),entrySha256:sha(source)};report.cases.push(row);
  const calls=[...source.matchAll(/await render\(\s*([A-Za-z_$][\w$]*),/g)];assert.ok(calls.length>=1&&calls.length<=4);
  const names=[...new Set(calls.map(row=>row[1]))];assert.equal(names.length,1);
  const patched=pkg.version==="1.0.3"?patchOgNodeBootstrap(Buffer.from(source)):null;
  if(patched){row.nodeBootstrap=patched.proof;assert.equal(patchOgNodeBootstrap(Buffer.from(patched.code)).code,patched.code);}
  const qualifiedSource=patched?.code??source;
  const assets=[];let probe=qualifiedSource.replace(/new URL\((["'])\.\/(noto-sans-v27-latin-regular\.ttf|Geist-Regular\.ttf|resvg\.wasm)\1,\s*import\.meta\.url\)/g,(before,_quote,name)=>{
    const after='new URL('+JSON.stringify(pathToFileURL(path.join(packageRoot,"dist",name)).href)+')';assets.push([before,after,name]);return after;});
  assert.equal(assets.length,2);let reversed=probe;
  for(const [before,after]of assets){assert.equal(reversed.split(after).length-1,1);reversed=reversed.replace(after,before);}
  assert.equal(reversed,qualifiedSource,"Only declared Node bootstrap, asset paths and additive internal export; original vendor rendering logic retained");
  probe+='\nexport { '+names[0]+' as withinBundledSatori };\n';
  const probePath=path.join(runtime.directory,label+"-probe.mjs");await writeFile(probePath,probe,{flag:"wx"});
  const fontName=assets.find(row=>row[2].endsWith(".ttf"))?.[2];assert.ok(fontName);
  const worker=new Worker(new URL("./lib/og-security-probe-worker.mjs",import.meta.url),{workerData:{probePath,fontPath:path.join(packageRoot,"dist",fontName)},
    resourceLimits:{maxOldGenerationSizeMb:64,maxYoungGenerationSizeMb:16,stackSizeMb:2}});
  let timer,result;
  try{result=await new Promise((resolve,reject)=>{timer=setTimeout(()=>reject(new Error("Bounded OG probe deadline")),20000);
    worker.once("message",resolve);worker.once("error",reject);worker.once("exit",code=>{if(code!==0)reject(new Error("Probe worker exit "+code));});});}
  finally{clearTimeout(timer);await worker.terminate();}
  Object.assign(row,{
    embeddedSatoriVersions:[...new Set([...source.matchAll(/satori@(\d+\.\d+\.\d+)/g)].map(hit=>hit[1]))],
    containsXmlNameValidation:source.includes("Invalid XML"),sourceLogicReversed:true,probeSha256:sha(probe),cases:result.cases,requests:result.requests,fetchProof:result.fetchProof,failure:result.failure,
    zipParserWitness:{containsUnzipSyncName:/\bunzipSync\b/.test(source),containsZip64WalkerName:/\bz64e\b/.test(source),containsZip64CentralSignature:source.includes("101075792")||/0x0?6064b50/i.test(source),containsEndOfCentralDirectorySignature:source.includes("101010256")||/0x0?6054b50/i.test(source)}});
  assert.equal(result.failure,undefined,result.failure);assert.deepEqual(result.requests,[]);
  const png=Buffer.from(result.pngBase64,"base64");assert.ok(png.length<=65536);
  const output=path.join(runtime.directory,label+"-framework-fixture.png");await writeFile(output,png,{flag:"wx"});
  const decoded=spawnSync("ffmpeg",["-v","error","-threads","1","-i",output,"-pix_fmt","rgba","-f","rawvideo","-"],
    {cwd:root,env:runtime.env,windowsHide:true,timeout:10000,maxBuffer:65536});
  assert.ifError(decoded.error);assert.equal(decoded.status,0,decoded.stderr?.toString());assert.equal(decoded.stdout.length,32*16*4);
  for(let at=0;at<decoded.stdout.length;at+=4)assert.deepEqual([...decoded.stdout.subarray(at,at+4)],[0,255,0,255]);
  row.png={bytes:png.length,sha256:sha(png),decodedBytes:decoded.stdout.length,rgbaSha256:sha(decoded.stdout),everyPixelOpaqueGreen:true};
}
try{
  await writeFile(path.join(runtime.directory,"package.json"),JSON.stringify({private:true,dependencies:{"@vercel/og":"1.0.3"},overrides:{"satori@0.33.5":{fflate:"0.7.5"}}}),{flag:"wx"});
  const installed=spawnSync(process.execPath,[npmCli,"install","--prefix",runtime.directory,"--ignore-scripts","--no-audit","--no-fund","--save-exact","@vercel/og@1.0.3"],
    {cwd:runtime.directory,env:npmEnv,windowsHide:true,encoding:"utf8",timeout:180000,maxBuffer:65536});
  assert.ifError(installed.error);assert.equal(installed.status,0,installed.stderr);
  const lockBytes=await readFile(path.join(runtime.directory,"package-lock.json"));report.candidateLockSha256=sha(lockBytes);
  const lock=JSON.parse(lockBytes);report.candidatePackages=Object.fromEntries(Object.entries(lock.packages).filter(([name])=>name).map(([name,value])=>[name,{version:value.version,integrity:value.integrity}]));
  const audit=spawnSync(process.execPath,[npmCli,"audit","--json","--ignore-scripts","--package-lock-only"],
    {cwd:runtime.directory,env:npmEnv,windowsHide:true,encoding:"utf8",timeout:120000,maxBuffer:1048576});
  assert.ifError(audit.error);assert.ok(audit.status===0||audit.status===1);report.auditExitCode=audit.status;report.audit=JSON.parse(audit.stdout);
  const candidateRequire=createRequire(path.join(runtime.directory,"package.json")),fflate=candidateRequire("fflate");
  const fflateEntry=candidateRequire.resolve("fflate"),fflatePackage=JSON.parse(await readFile(path.join(runtime.directory,"node_modules/fflate/package.json")));
  assert.equal(fflatePackage.version,"0.7.5");const sample=Uint8Array.of(1,2,3);
  assert.deepEqual(fflate.unzipSync(fflate.zipSync({"bounded.txt":sample}))["bounded.txt"],sample);
  report.fflateControl={version:fflatePackage.version,entrySha256:sha(await readFile(fflateEntry)),boundedArchiveRoundtrip:true};
  await inspect("before",path.join(root,"node_modules/@vercel/og"));
  await inspect("candidate",path.join(runtime.directory,"node_modules/@vercel/og"));
  const [before,after]=report.cases;
  assert.equal(before.version,"0.8.6");assert.equal(after.version,"1.0.3");assert.ok(before.embeddedSatoriVersions.includes("0.16.0"));assert.ok(after.embeddedSatoriVersions.includes("0.33.5"));
  assert.equal(before.cases.find(row=>row.name==="attribute-value").injectedPath,true);
  const escaped=after.cases.find(row=>row.name==="attribute-value");assert.equal(escaped.injectedPath,false);assert.equal(escaped.escapedAttribute,true);
  for(const name of ["invalid-element","invalid-attribute","internal-style"]){const value=after.cases.find(row=>row.name===name);assert.equal(value.kind,"rejected");assert.match(value.error,/Invalid (?:XML|style property)/);}
  assert.deepEqual(after.png.rgbaSha256,before.png.rgbaSha256);
  report.status="passed-isolated-embedded-runtime-security-and-api-controls-not-installed";
}catch(error){report.status="failed-isolated-og-security-candidate";report.failure=String(error.stack??error);process.exitCode=1;}
finally{
  await runtime.close();report.ownedScratchRemoved=true;
  for(const [file,digest]of Object.entries(sourcePins))assert.equal(sha(await readFile(path.join(root,file))),digest,file);
  report.finishedAt=new Date().toISOString();await writeFile(destination,JSON.stringify(report,null,2)+"\n",{flag:"wx"});
}
console.log(JSON.stringify({path:path.relative(root,destination),status:report.status,versions:report.cases.map(row=>row.version),audit:report.audit?.metadata?.vulnerabilities,cleanup:report.ownedScratchRemoved,failure:report.failure}));
