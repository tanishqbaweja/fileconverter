// Exact138 executed native preimages, two original-sized bounded layers.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { gzipSync, gunzipSync } from "node:zlib";
import { sha } from "./lib/stable-ui-headless-baseline-recipe.mjs";
import { readWasmFunctionMetadata } from "./lib/wasm-function-metadata.mjs";
import { readWasmMemoryLimits } from "./lib/wasm-memory-limits.mjs";
import { JSPI_BUILD_FILES } from "../media/ffmpeg/mpeg2-jspi-builder-recipe.mjs";
import { LTO_BUILD_FILES, makeLtoShellRecipe } from "../media/ffmpeg/mpeg2-lto-builder-recipe.mjs";
const root=path.resolve(import.meta.dirname,".."),read=file=>readFile(path.join(root,file)),execute=promisify(execFile);
const proofPath="evidence/mpeg2-lto-build-39279724223.json",proofBytes=await read(proofPath),build=JSON.parse(proofBytes);
const branchPath="evidence/mpeg2-lto-build-branch-2026-10-19.json",branchBytes=await read(branchPath),branch=JSON.parse(branchBytes);
assert.equal(build.run.headSha,"36713782ef0bd8d6ee0fd9b3a4f661cb619b9a9d");assert.equal(branch.commit,build.run.headSha);
assert.equal(build.run.conclusion,"success");assert.equal(branch.remoteVerified,true);
const previous=JSON.parse(await read("evidence/mpeg2-jspi-build-39072949964.json"));
const parent=JSON.parse(await read("evidence/mpeg2-duration-drain-build-38678806473.json"));
assert.equal(Object.keys(previous.manifest.sources).length,132);
for(const [file,digest]of Object.entries(previous.manifest.sources))if(file!==branch.workflow.path)assert.equal(build.manifest.sources[file],digest,file);
const parentFiles=Object.keys(parent.manifest.sources),extras=Object.keys(build.manifest.sources).filter(file=>!parentFiles.includes(file));
assert.equal(parentFiles.length,126);assert.equal(extras.length,12);assert.equal(Object.keys(build.manifest.sources).length,138);
assert.deepEqual(extras.toSorted(),[...JSPI_BUILD_FILES,...LTO_BUILD_FILES].toSorted());
const recipe=makeLtoShellRecipe((await read("media/ffmpeg/build-mpeg2-split-pipeline.sh")).toString());
assert.deepEqual(build.manifest.libraryLto,recipe.libraryLto);assert.equal(build.manifest.jspi.generatedShell,recipe.generated);
const layers=[];
for(const [label,files]of [["parent",parentFiles],["lto-extension",extras]]){
  assert.ok(files.length<=128);const preimages={},currentSourcePins={},sourcePins={};
  for(let index=0;index<files.length;index+=8){
    const rows=await Promise.all(files.slice(index,index+8).map(async file=>{
      assert.ok(!file.includes("..")&&!path.isAbsolute(file));
      const {stdout}=await execute("git",["show",`${build.run.headSha}:${file}`],{cwd:root,windowsHide:true,encoding:"buffer",timeout:30000,maxBuffer:262144});
      assert.equal(sha(stdout),build.manifest.sources[file],file);const current=await read(file);
      if(file===branch.workflow.path){assert.equal(stdout.toString(),branch.workflow.generatedExactSource);assert.equal(sha(current),branch.workflow.canonicalSha256);}
      else assert.equal(sha(current),sha(stdout),file);
      return{file,executed:stdout,current};
    }));
    for(const row of rows){sourcePins[row.file]=sha(row.executed);currentSourcePins[row.file]=sha(row.current);preimages[row.file]=row.executed.toString("base64");}
  }
  const raw=Buffer.from(JSON.stringify({sourcePins,currentSourcePins,preimages}));assert.ok(raw.length<=2097152);
  const zip=gzipSync(raw,{level:9}),file=`outputs/reports/lto-native-${label}-sources-39279724223.json.gz`;
  await writeFile(path.join(root,file),zip,{flag:"wx"});assert.deepEqual(gunzipSync(await read(file)),raw);
  layers.push({label,sourceCount:files.length,sourcePins,currentSourcePins,archive:{path:file,bytes:zip.length,sha256:sha(zip),restoredBytes:raw.length,restoredSha256:sha(raw)}});
}
const slot="work/mpeg2-lto-39279724223";assert.equal(build.files.length,20);
for(const row of build.files){const bytes=await read(`${slot}/${row.file}`);assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);}
const binary=await read(`${slot}/within-mpeg2-split.wasm`),oldBinary=await read("work/mpeg2-jspi-39072949964/within-mpeg2-split.wasm");
assert.equal(sha(binary),"49e8229f4bbfb43fb93c0c59ebfa2fac9f3574944f50c58078d6d1dd00925c2d");
assert.equal(sha(oldBinary),"4f3954a3cbbd5012c811fa380402981d29ac298d46422d1bc0fa40a6b9368d57");
assert.deepEqual(readWasmMemoryLimits(binary),[{imported:true,initialPages:512,maximumPages:512,shared:true}]);
const expected=new Map([["av_buffer_allocz",[1,1]],["av_malloc",[1,1]],["av_refstruct_pool_get",[1,1]],["mpeg2_packets",[2,1]],
  ["__wrap_posix_memalign",[2,1]],["sbrk",[1,1]],["emscripten_builtin_malloc",[1,1]],["emscripten_builtin_realloc",[2,1]],
  ["av_buffer_realloc",[2,1]],["__wrap_av_realloc",[2,1]],["__wrap_av_buffer_realloc",[2,1]]]);
const metadata=bytes=>readWasmFunctionMetadata(bytes,new Set(expected.keys())).map(row=>{
  const [params,results]=expected.get(row.name);assert.deepEqual(row.params,Array(params).fill("i32"));assert.deepEqual(row.results,Array(results).fill("i32"));
  return{...row,bodySha256:sha(bytes.subarray(row.bodyStart,row.bodyEnd))};
});
const functions=metadata(binary),parentFunctions=metadata(oldBinary),layout={},map=(await read(`${slot}/decoder-link.map`)).toString();
for(const symbol of ["_gm_","within_allocator_attempt_words","within_realloc_attempt_words","within_refstruct_abort_words"]){
  const matches=[...map.matchAll(new RegExp(`^\\s*([a-f0-9]+)\\s+[a-f0-9-]+\\s+([a-f0-9]+)\\s+${symbol}$`,"gm"))];
  assert.equal(matches.length,1,symbol);layout[symbol]={address:parseInt(matches[0][1],16),bytes:parseInt(matches[0][2],16)};
}
assert.deepEqual(layout,{_gm_:{address:408936,bytes:496},within_allocator_attempt_words:{address:541024,bytes:64},
  within_realloc_attempt_words:{address:541088,bytes:64},within_refstruct_abort_words:{address:1913344,bytes:64}});
const own="scripts/retain-lto-native-sources.mjs",ownBytes=await read(own),output="evidence/lto-native-sources-39279724223.json";
await writeFile(path.join(root,output),JSON.stringify({recordedAt:new Date().toISOString(),status:"executed-library-lto-native-preimages-and-static-abi-verified-not-browser-acceptance",
  proof:{path:proofPath,sha256:sha(proofBytes)},branch:{path:branchPath,sha256:sha(branchBytes)},executedHead:build.run.headSha,
  layers,sourceCount:138,allSourcesMatchedExecutedGitHead:true,workflowCanonicalDiffOnly:true,
  allPrevious132SourcesUnchangedExceptIsolatedWorkflow:true,onlyDecoderLibraryCompileLinkFlagsChanged:true,
  decoder:{bytes:binary.length,sha256:sha(binary)},parentDecoder:{bytes:oldBinary.length,sha256:sha(oldBinary)},
  decoderBytesIncrease:binary.length-oldBinary.length,layout,functions,parentFunctions,
  accompanyingDefaultEncoderIsNotQualifiedPlaneEncoder:true,
  browserCompositionMustKeepEncoderSha256:"a4ba6225414ca7a658d349ae81926e5ed040fa73be4540fe8a7adf7656fe1cee",
  ownSource:{path:own,sha256:sha(ownBytes),preimage:ownBytes.toString("base64")},
  oldIndicesOrAddressesMustNotBeReused:true,actualRuntimeFatalRequalified:false,originalRead:false,conversions:0,
  memoryAcceptance:false,speedGainProven:false,publicAcceptance:false},null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({output,sourceCount:138,layers:layers.map(row=>({count:row.sourceCount,bytes:row.archive.bytes})),
  decoderBytes:binary.length,decoderGrowthBytes:binary.length-oldBinary.length,layout,speedGainProven:false}));
