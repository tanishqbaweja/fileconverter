// Owned private build only, no media/native codec execution.
import assert from "node:assert/strict";
import {readFile,realpath,writeFile} from "node:fs/promises";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {createHash} from "node:crypto";
import {makeVp9TokenContextSources} from "./vp9-token-context-recipe.mjs";
import {VP9_TOKEN_CONTEXT_LIFETIME_PINS,verifyVp9TokenContextLifetime} from "./vp9-token-context-lifetime.mjs";
import {runVp9TokenContextCUnit} from "./vp9-token-context-c-unit.mjs";
assert.ok(process.argv.length===2||(process.argv.length===3&&process.argv[2]==="--layout"));
const root=path.resolve(import.meta.dirname,"../.."),build=path.join(root,"work/vp9-duration-build"),vendor=path.join(build,"libvpx"),
  proofFile=path.join(build,"vp9-token-context-proof.json"),sha=s=>createHash("sha256").update(s).digest("hex");
assert.equal(await realpath(build),build);assert.equal(await realpath(vendor),vendor);
const stems={"vp9/encoder/vp9_tokenize.h":"vp9_tokenize.header","vp9/encoder/vp9_tokenize.c":"vp9_tokenize.producer",
  "vp9/encoder/vp9_bitstream.c":"vp9_bitstream.packer"};
if(process.argv[2]==="--layout") {
  const proof=JSON.parse(await readFile(proofFile));assert.equal(proof.layout,null);
  for(const [file,row] of Object.entries(proof.sources))assert.equal(sha(await readFile(path.join(vendor,file))),row.generatedSha256);
  const config=await readFile(path.join(vendor,"vpx_config.h"),"utf8"),match=config.match(/^#define CONFIG_VP9_HIGHBITDEPTH ([01])$/m);assert.ok(match);
  const highBitDepth=Number(match[1]),originalBytes=highBitDepth?12:8,compactBytes=highBitDepth?8:6,
    source='#include "vp9/encoder/vp9_tokenize.h"\n'+
    "typedef struct {const vpx_prob *context_tree;int16_t token;EXTRABIT extra;} WithinOriginalToken;\n"+
    '_Static_assert(sizeof(void*)==4,"Wasm32 required");\n'+
    '_Static_assert(sizeof(WithinOriginalToken)=='+originalBytes+',"original layout");\n'+
    '_Static_assert(sizeof(TOKENEXTRA)=='+compactBytes+',"compact layout");\n'+
    "int within_original_token_bytes=sizeof(WithinOriginalToken);\nint within_compact_token_bytes=sizeof(TOKENEXTRA);\n"+
    "int within_token_highbitdepth=CONFIG_VP9_HIGHBITDEPTH;\n",
    file=path.join(build,"vp9-token-layout-probe.c"),output=path.join(build,"vp9-token-layout-probe.ll");
  await writeFile(file,source,{flag:"wx"});
  await promisify(execFile)("emcc",["-I"+vendor,"-std=c11","-S","-emit-llvm",file,"-o",output],
    {cwd:root,windowsHide:true,timeout:30000,maxBuffer:262144});
  const llvm=await readFile(output,"utf8");assert.match(llvm,/target triple = "wasm32-unknown-emscripten"/);
  for(const [symbol,value] of [["within_original_token_bytes",originalBytes],["within_compact_token_bytes",compactBytes],["within_token_highbitdepth",highBitDepth]])
    assert.match(llvm,new RegExp("@"+symbol+" = .*i32 "+value+","));
  await writeFile(path.join(build,"vp9-token-vpx-config.h"),config,{flag:"wx"});
  proof.layout={highBitDepth,originalRecordBytes:originalBytes,compactRecordBytes:compactBytes,
    actualLibraryConfiguration:true,vpxConfigSha256:sha(config),cSourceSha256:sha(source),llvmSha256:sha(llvm),codecInstantiated:false};
  await writeFile(proofFile,JSON.stringify(proof,null,2)+"\n");
  console.log(JSON.stringify({actualLibraryTokenLayout:proof.layout}));
} else {
  const lifetimeSources={};for(const file of Object.keys(VP9_TOKEN_CONTEXT_LIFETIME_PINS)) {
    const target=file==="vp9/encoder/vp9_encoder.c"?path.join(build,"vp9_encoder.temporal.base.c"):path.join(vendor,file);
    assert.equal(await realpath(target),target);lifetimeSources[file]=await readFile(target,"utf8");
  }
  const currentEncoder=await readFile(path.join(vendor,"vp9/encoder/vp9_encoder.c"),"utf8");
  const lifetime=verifyVp9TokenContextLifetime(lifetimeSources,currentEncoder),preimages={};
  for(const file of Object.keys(stems)){const target=path.join(vendor,file);assert.equal(await realpath(target),target);preimages[file]=await readFile(target,"utf8");}
  const candidate=makeVp9TokenContextSources(preimages),cUnit=await runVp9TokenContextCUnit(preimages),proof={...candidate,sources:{},lifetime,cUnit,layout:null};
  for(const [file,{generated,...row}] of Object.entries(candidate.sources)) {
    proof.sources[file]=row;await writeFile(path.join(build,stems[file]+".base.c"),preimages[file],{flag:"wx"});
    await writeFile(path.join(build,stems[file]+".compact.c"),generated,{flag:"wx"});
  }
  await writeFile(proofFile,JSON.stringify(proof,null,2)+"\n",{flag:"wx"});
  for(const [file,{generated}] of Object.entries(candidate.sources)) {
    await writeFile(path.join(vendor,file),generated);assert.equal(await readFile(path.join(vendor,file),"utf8"),generated);
  }
  console.log(JSON.stringify({privateTokenContextPatched:true,actualSavedBytes:null,browserValidated:false}));
}
