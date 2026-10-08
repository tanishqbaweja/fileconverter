// Private production source overlay; default finally restores the normal build.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { createBuilder } from "vite";
import { ESLint } from "eslint";
import ts from "typescript";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { makeSplitRenderUiSource, baselineBinding } from "./lib/split-render-ui-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),appPath=path.join(root,"app/converter/ConverterApp.tsx"),stamp=process.argv[2];
assert.match(stamp,/^\d{4}-\d{2}-\d{2}T[0-9TZ-]+$/);
assert.ok(process.argv.length===3||(process.argv.length===4&&process.argv[3]==="--for-browser"));
const forBrowser=process.argv[3]==="--for-browser",baseline=await readFile(appPath,"utf8"),recipe=makeSplitRenderUiSource(baseline,root),candidate=recipe.source;
const pinPaths=["scripts/build-split-render-ui-candidate.mjs","scripts/lib/split-render-ui-recipe.mjs",
  "tests/split-render-ui.test.mjs","tests/split-render-ui-react.test.mjs","package-lock.json","tsconfig.json",
  "app/converter/ConverterApp.tsx","app/globals.css"];
const sourcePins=await Promise.all(pinPaths.map(async file=>{const bytes=await readFile(path.join(root,file));return {path:file,bytes:bytes.length,sha256:sha(bytes)};}));
const lint=await new ESLint().lintText(candidate,{filePath:appPath});assert.ok(lint.every(row=>row.errorCount===0&&row.warningCount===0),JSON.stringify(lint.map(row=>row.messages)));
const config=ts.readConfigFile(path.join(root,"tsconfig.json"),ts.sys.readFile);assert.equal(config.error,undefined);
const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root),options={...parsed.options,incremental:false,noEmit:true};
const host=ts.createCompilerHost(options),read=host.readFile;host.readFile=file=>path.resolve(file).toLowerCase()===appPath.toLowerCase()?candidate:read(file);
const diagnostics=ts.getPreEmitDiagnostics(ts.createProgram(parsed.fileNames,options,host));
assert.equal(diagnostics.length,0,ts.formatDiagnosticsWithColorAndContext(diagnostics,{getCanonicalFileName:file=>file,getCurrentDirectory:()=>root,getNewLine:()=>"\n"}));
const loads=[];let restored=false,buildStarted=false,proof;
const functionSizes=bytes=>{
  const file=ts.createSourceFile("built.js",bytes.toString(),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS),rows=[];
  const walk=node=>{if(ts.isFunctionLike(node)&&node.body)rows.push({name:node.name?.getText(file)??null,bytes:node.getEnd()-node.getStart(file)});ts.forEachChild(node,walk);};walk(file);
  return rows.sort((a,b)=>b.bytes-a.bytes).slice(0,12);
};
const baselineAsset=await readFile(path.join(root,"dist/client"+baselineBinding.url));assert.equal(sha(baselineAsset),baselineBinding.sha256);
try{
  const builder=await createBuilder({root,plugins:[{name:"within-private-split-render-ui-overlay",enforce:"pre",load(id){
    if(path.resolve(id.split("?")[0]).toLowerCase()!==appPath.toLowerCase())return null;
    assert.ok(loads.length<16);loads.push({environment:this.environment.name,id});return candidate;
  }}]});buildStarted=true;await builder.buildApp();assert.ok(loads.some(row=>row.environment==="client"));
  const names=(await readdir(path.join(root,"dist/client/assets"))).filter(name=>/^ConverterApp-.*\.js$/.test(name));assert.equal(names.length,1);
  const bytes=await readFile(path.join(root,"dist/client/assets",names[0]));assert.ok(bytes.length<1048576);
  const archive=async(suffix,raw)=>{const gzip=gzipSync(raw,{level:9});const file=`outputs/reports/${stamp}-split-render-ui-${suffix}.gz`;
    await writeFile(path.join(root,file),gzip,{flag:"wx"});const saved=await readFile(path.join(root,file));
    assert.deepEqual(saved,gzip);assert.deepEqual(gunzipSync(saved),raw);
    return {path:file,bytes:gzip.length,sha256:sha(gzip),restoredBytes:raw.length,restoredSha256:sha(raw),roundTripVerified:true};};
  proof={recordedAt:new Date().toISOString(),status:"private-production-split-render-built-not-browser-acceptance",
    recipe:{...recipe,source:undefined},sourcePins,loads,asset:{url:`/assets/${names[0]}`,bytes:bytes.length,sha256:sha(bytes)},
    sourceArchive:await archive("candidate.tsx",Buffer.from(candidate)),assetArchive:await archive("client.js",bytes),
    baselineLargestBuiltFunctions:functionSizes(baselineAsset),candidateLargestBuiltFunctions:functionSizes(bytes),
    candidateLintErrors:0,candidateLintWarnings:0,candidateTypeDiagnostics:0,publishedSourceUnchanged:true,
    engineChanged:false,cssChanged:false,limitsChanged:false,forBrowser,normalProductionRestored:false,
    publicAcceptance:false,nativeAllocationCauseProven:false,conversionSpeedAcceptance:false,completeChromiumMemoryAcceptance:false};
}finally{
  if(buildStarted&&!forBrowser){
    await promisify(execFile)(process.execPath,["node_modules/vinext/dist/cli.js","build"],{cwd:root,windowsHide:true,timeout:180000,maxBuffer:2*1048576});
    assert.equal(sha(await readFile(path.join(root,"dist/client"+baselineBinding.url))),baselineBinding.sha256);restored=true;
  }
  assert.equal(await readFile(appPath,"utf8"),baseline);
  for(const pin of sourcePins){const bytes=await readFile(path.join(root,pin.path));assert.equal(bytes.length,pin.bytes,pin.path);assert.equal(sha(bytes),pin.sha256,pin.path);}
}
assert.ok(proof);proof.normalProductionRestored=restored;
const proofPath=`evidence/${stamp}-split-render-ui-build.json`;
await writeFile(path.join(root,proofPath),JSON.stringify(proof,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({proofPath,asset:proof.asset,modelFunctionBytes:recipe.modelFunctionBytes,originalComponentBytes:recipe.originalComponentBytes,
  baselineLargestBuiltFunctions:proof.baselineLargestBuiltFunctions,candidateLargestBuiltFunctions:proof.candidateLargestBuiltFunctions,normalProductionRestored:restored}));
