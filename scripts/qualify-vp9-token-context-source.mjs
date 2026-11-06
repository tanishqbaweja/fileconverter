// Source/ABI/mock controls only. Never instantiate a media codec or read test.mkv.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
import {makeVp9TokenContextSources} from "../media/ffmpeg/vp9-token-context-recipe.mjs";
import {runVp9TokenContextCUnit} from "../media/ffmpeg/vp9-token-context-c-unit.mjs";
import {createOwnedRuntimeScratch} from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length,2);
const root=path.resolve(import.meta.dirname,".."),json=async f=>JSON.parse(await readFile(path.join(root,f))),
  audit=await json("evidence/2026-11-06-vp9-token-context-source-audit.json"),
  preimages=Object.fromEntries(Object.entries(audit.preimages).map(([f,v])=>[f,v.exactSource])),
  candidate=makeVp9TokenContextSources(preimages),native=await json("evidence/2026-11-06-vp9-original-width-native-42218018139.json"),
  encoderFile="work/vp9-duration-input-42218018139/vp9_encoder.lazy.utility.c",encoder=await readFile(path.join(root,encoderFile),"utf8"),
  sha=s=>createHash("sha256").update(s).digest("hex");
assert.equal(sha(encoder),native.nativeContract.candidate.compiledVendorSources["vp9/encoder/vp9_encoder.c"]);
const lines=encoder.split("\n"),frameContextReferences=lines.flatMap((line,index)=>/\bcm->fc\b|\bcpi->common\.fc\b/.test(line)
  ?[{line:index+1,context:lines.slice(Math.max(0,index-3),index+4).join("\n")}]:[]);
assert.equal(frameContextReferences.length,7);
assert.equal(encoder.split("CHECK_MEM_ERROR(&cm->error, cm->fc,").length,2);
assert.equal(encoder.split("(FRAME_CONTEXT *)vpx_calloc(1, sizeof(*cm->fc))").length,2);
// The two encoder '= frame context' writes are through *cm->fc, not rebinding.
assert.deepEqual(lines.filter(line=>/cm->fc\s*=(?!=)/.test(line)).map(line=>line.trim()),
  ["*cm->fc = cm->frame_contexts[cm->frame_context_idx];","*cm->fc = cc->fc;"]);
const runtime=await createOwnedRuntimeScratch("vp9-token-context-layout-"),execute=promisify(execFile),
  compiler=process.env.WITHIN_WASM_LAYOUT_CC??"clang",options={cwd:root,env:runtime.env,windowsHide:true,timeout:30000,maxBuffer:262144};
let layout;
try {
  const variants=[];
  for(const highBitDepth of [0,1]) {
    const declaration=source=>{const match=source.match(/typedef struct \{\n  (?:const vpx_prob \*context_tree|uint16_t context_tree_offset);\n  int16_t token;\n  EXTRABIT extra;\n\} TOKENEXTRA;/);assert.ok(match);return match[0];};
    const original=declaration(preimages["vp9/encoder/vp9_tokenize.h"]).replace("} TOKENEXTRA;","} OriginalToken;"),
      changed=declaration(candidate.sources["vp9/encoder/vp9_tokenize.h"].generated),
      source="typedef unsigned char vpx_prob; typedef short int16_t; typedef unsigned short uint16_t; typedef int int32_t;\n"+
      "typedef "+(highBitDepth?"int32_t":"int16_t")+" EXTRABIT;\n"+original+"\n"+changed+"\n"+
      "_Static_assert(sizeof(void*)==4,\"must be Wasm32\");\n"+
      "_Static_assert(sizeof(OriginalToken)=="+(highBitDepth?12:8)+",\"original pinned layout\");\n"+
      "_Static_assert(sizeof(TOKENEXTRA)=="+(highBitDepth?8:6)+",\"candidate pinned layout\");\n"+
      "int original_token_bytes=sizeof(OriginalToken); int candidate_token_bytes=sizeof(TOKENEXTRA);\n",
      file=path.join(runtime.directory,"layout-"+highBitDepth+".c"),output=path.join(runtime.directory,"layout-"+highBitDepth+".ll");
    await writeFile(file,source,{flag:"wx"});
    await execute(compiler,["--target=wasm32-unknown-unknown","-std=c11","-Wall","-Wextra","-Werror","-S","-emit-llvm",file,"-o",output],options);
    const llvm=await readFile(output,"utf8");assert.match(llvm,/target triple = "wasm32-unknown-unknown"/);
    assert.match(llvm,new RegExp("@original_token_bytes = .*i32 "+(highBitDepth?12:8)+","));
    assert.match(llvm,new RegExp("@candidate_token_bytes = .*i32 "+(highBitDepth?8:6)+","));
    variants.push({highBitDepth,originalRecordBytes:highBitDepth?12:8,candidateRecordBytes:highBitDepth?8:6,
      cSourceSha256:sha(source),llvmSha256:sha(llvm)});
  }
  layout={scope:"Actual clang Wasm32 static-assert/LLVM layout control, NOT a linked/instantiated codec",variants};
} finally {await runtime.close();}
const cUnit=await runVp9TokenContextCUnit(preimages),compact=Object.fromEntries(Object.entries(candidate.sources).map(([file,{generated:_generated,...proof}])=>{void _generated;return[file,proof];}));
const report={recordedAt:new Date().toISOString(),scope:"Private token representation source/ABI/mock qualification, NOT native build or browser acceptance",
  recipeSha256:sha(await readFile(path.join(root,"media/ffmpeg/vp9-token-context-recipe.mjs"))),
  sources:compact,layout,cUnit,
  frameContext:{encoderFile,sha256:sha(encoder),references:frameContextReferences,
    allocationInEncoderCreate:true,observedEncoderFrameContextWritesAreObjectCopies:true,
    sourceInventoryIsNotExhaustiveAliasOrMacroAnalysis:true,
    note:"The earlier simple assignment inventory includes *cm->fc value copies and omits CHECK_MEM_ERROR allocation; it alone does not prove pointer lifetime"},
  unchangedTokenCapacity:true,actualCompiledHighBitDepthConfiguration:null,actualMemorySavedBytes:null,
  wasmCodecBuilt:false,browserValidated:false,independentBitExactBrowserControlPassed:false,
  speedGainProven:false,publicAcceptance:false,userMediaReadOrConverted:false,
  nextAction:"Audit complete context-base lifetime and all TOKENEXTRA consumers, then integrate into a distinct private build; require real bit-exact/fidelity/recovery and full-original browser tests before acceptance"};
await writeFile(path.join(root,"evidence/2026-11-06-vp9-token-context-source-qualification.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({layout:layout.variants.map(v=>[v.highBitDepth,v.originalRecordBytes,v.candidateRecordBytes]),
  producerPackerCases:cUnit.variants.reduce((n,v)=>n+v.producerPackerCases,0),actualMemorySavedBytes:null,wasmCodecBuilt:false}));
