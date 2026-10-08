// Real React/actual display source. Model fixtures test UI equivalence, NOT converter progress or outputs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { registerHooks } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import * as React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { makeSplitRenderUiSource } from "../scripts/lib/split-render-ui-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),app=path.join(root,"app/converter/ConverterApp.tsx");
const original=await readFile(app,"utf8"),candidate=makeSplitRenderUiSource(original,root);
const parsed=ts.createSourceFile(app,original,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const imports=new Map([["react",React],["react/jsx-runtime",jsxRuntime]]);
// Node's built-in TS stripping preserves actual modules; resolve only the
// repository's extensionless relative TS imports while loading this test.
const libUrl=pathToFileURL(path.join(root,"lib")+path.sep).href;
const resolver=registerHooks({resolve(specifier,context,nextResolve){
  try{return nextResolve(specifier,context);}catch(error){
    if(error.code!=="ERR_MODULE_NOT_FOUND"||!specifier.startsWith(".")||!context.parentURL?.startsWith(libUrl)||path.extname(specifier))throw error;
    return nextResolve(specifier+".ts",context);
  }
}});
try{
  for(const statement of parsed.statements){
    if(!ts.isImportDeclaration(statement)||statement.importClause?.isTypeOnly)continue;
    const name=statement.moduleSpecifier.text;if(imports.has(name))continue;
    imports.set(name,await import(pathToFileURL(path.resolve(path.dirname(app),name)+".ts").href));
  }
}finally{resolver.deregister();}
const component=parsed.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==="ConverterApp");
const returned=component.body.statements.find(ts.isReturnStatement).expression.getText(parsed);
function compile(source,extra){
  // CommonJS VM needs the equivalent absolute module URL. SSR never runs the
  // worker-creating effect; this test does not claim engine/browser coverage.
  assert.equal((source.match(/import\.meta\.url/g)??[]).length,1);
  const vmSource=source.replace("import.meta.url",JSON.stringify(pathToFileURL(app).href));
  const result=ts.transpileModule(vmSource+"\n"+extra,{fileName:app,reportDiagnostics:true,
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}});assert.deepEqual(result.diagnostics,[]);
  const compiledModule={exports:{}};
  runInNewContext(result.outputText,{module:compiledModule,exports:compiledModule.exports,require:name=>{assert.ok(imports.has(name),name);return imports.get(name);},
    URLSearchParams,Set,Map,Intl,Date},{timeout:1000});return compiledModule.exports;
}
const before=compile(original,`module.exports.UnitView=function UnitView(model){const {${candidate.snapshotFields.join(",")}}=model;return (${returned});};`);
const after=compile(candidate.source,"module.exports.UnitView=renderConverterPage;module.exports.UnitModel=function UnitModel(props){const model=useConverterAppModel();props.observe(model);return renderConverterPage(model);};");
let initial;
renderToStaticMarkup(React.createElement(after.UnitModel,{observe:model=>{initial=model;}}));assert.ok(initial);
const markup=(View,model)=>renderToStaticMarkup(React.createElement(View,model));
test("Actual whole component SSR, all405 cards and original DOM match after custom-hook/render decomposition",()=>{
  const originalHtml=renderToStaticMarkup(React.createElement(before.ConverterApp));
  const candidateHtml=renderToStaticMarkup(React.createElement(after.ConverterApp));
  assert.equal(candidateHtml,originalHtml);
  assert.equal((candidateHtml.match(/<article/g)??[]).length,405);
});
test("Original complete display equals helpers for changing source, encoding controls, running/error/cancel and storage fixture models",()=>{
  const selectedProfile=imports.get("../../lib/capability-registry").conversionProfiles.find(row=>row.id==="mkv-to-mp4");assert.ok(selectedProfile);
  const selected={...initial,file:{name:"UNIT_ONLY_café.mkv",size:1234567,type:"video/x-matroska",lastModified:0},inputFormat:"mkv",batchFiles:[{}],
    totalInputBytes:1234567,selectedProfile,profiles:[selectedProfile],featureReady:true,workerStarting:false,sourceInspectionStatus:"inspecting"};
  const profiles=imports.get("../../lib/capability-registry").conversionProfiles,options=imports.get("../../lib/media-conversion-options");
  const audioProfile=profiles.find(options.supportsAudioEncodingOptions),videoProfile=profiles.find(options.supportsVideoEncodingOptions);
  assert.ok(audioProfile&&videoProfile);
  const audio={...selected,selectedProfile:audioProfile,profiles:[audioProfile],selectableAudioProfiles:[audioProfile],
    audioEncodingOptionsEnabled:true,selectedAudioCodec:options.audioCodecForProfile(audioProfile)};
  const video={...selected,selectedProfile:videoProfile,profiles:[videoProfile],videoEncodingOptionsEnabled:true};
  const metrics={inputBytes:64000,outputBytes:32000,elapsedMs:1000,queuedBytes:0,peakQueuedBytes:65536,pendingOperations:0,peakPendingOperations:1,
    wasmMemoryBytes:50331648,peakWasmMemoryBytes:50331648,sharedArrayBufferBytes:50331652,activeWorkerCount:1};
  const inspected={...selected,sourceInspectionStatus:"ready",sourceMediaInspection:{inspectedBytes:65536,maximumInspectionBytes:1048576,notes:[],
    container:"Matroska",codec:"hevc",durationSeconds:90,mediaType:"video",width:1920,height:804,frameRate:24,metadataSignals:[],
    streams:[{mediaType:"video",codec:"hevc",width:1920,height:804,frameRate:24}]}};
  const states=[[initial,'class="site-header"'],[selected,"Reading a bounded local header slice"],[audio,'data-testid="audio-codec-select"'],
    [video,'data-testid="video-codec-select"'],[inspected,"1920×804"],
    [{...selected,jobState:"running",phase:"UNIT_ONLY_processing",metrics,progress:25,throughput:64000,estimatedRemainingMs:2000},"UNIT_ONLY_processing"],
    [{...selected,jobState:"error",error:"UNIT_ONLY_write rejection",warnings:["UNIT_ONLY_warning"],metrics},"UNIT_ONLY_write rejection"],
    [{...selected,jobState:"cancelled",phase:"Cancelled",metrics,storageUsage:2048,storageQuota:4096,cleanupMessage:"UNIT_ONLY_cleaned"},"UNIT_ONLY_cleaned"]];
  for(const [state,expected] of states){
    assert.ok(Object.keys(state).every(key=>candidate.snapshotFields.includes(key)),"fixture must use actual display fields");
    const html=markup(after.UnitView,state);assert.equal(html,markup(before.UnitView,state));assert.ok(html.includes(expected),expected);
  }
});
