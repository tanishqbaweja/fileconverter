// Source/ABI/mock controls only. No codec instantiation or user-media read.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
import {makeVp9TokenPackedSources} from "../media/ffmpeg/vp9-token-packed-recipe.mjs";
import {verifyVp9TokenPackedAudit} from "../media/ffmpeg/vp9-token-packed-audit.mjs";
import {runVp9TokenPackedCUnit} from "../media/ffmpeg/vp9-token-packed-c-unit.mjs";
import {createOwnedRuntimeScratch} from "./lib/owned-runtime-scratch.mjs";
assert.equal(process.argv.length,2);
const root=path.resolve(import.meta.dirname,".."),sha=s=>createHash("sha256").update(s).digest("hex"),
  auditFile="evidence/2026-11-06-vp9-token-packed-source-audit.json",auditBytes=await readFile(path.join(root,auditFile)),audit=JSON.parse(auditBytes),
  reviewedDomain=verifyVp9TokenPackedAudit(audit),preimages=Object.fromEntries(Object.entries(audit.preimages).map(([f,v])=>[f,v.exactSource])),
  candidate=makeVp9TokenPackedSources(preimages),native=JSON.parse(await readFile(path.join(root,"evidence/2026-11-06-vp9-original-width-native-42226266102.json")));
for(const [file,row]of Object.entries(candidate.parentContextSources))assert.equal(row.generatedSha256,native.nativeContract.candidate.tokenContext.sourceSha256s[file]);
assert.equal(native.nativeContract.candidate.tokenContext.layout.highBitDepth,0);assert.equal(native.nativeContract.candidate.tokenContext.layout.compactRecordBytes,6);
const runtime=await createOwnedRuntimeScratch("vp9-token-packed-layout-"),execute=promisify(execFile),
  compiler=process.env.WITHIN_WASM_LAYOUT_CC??"clang",options={cwd:root,env:runtime.env,windowsHide:true,timeout:30000,maxBuffer:262144},variants=[];
try {
  for(const highBitDepth of [0,1]) {
    const previous=candidate.parentContextSources["vp9/encoder/vp9_tokenize.h"].generated.match(/typedef struct \{\n  uint16_t context_tree_offset[^}]+\} TOKENEXTRA;/),
      changed=candidate.sources["vp9/encoder/vp9_tokenize.h"].generated.match(/typedef struct \{\n  uint16_t context_tree_index[^}]+\} TOKENEXTRA;/);
    assert.ok(previous&&changed);
    const source="typedef short int16_t;typedef unsigned short uint16_t;typedef int int32_t;\n"+
      "typedef "+(highBitDepth?"int32_t":"int16_t")+" EXTRABIT;\n"+previous[0].replace("TOKENEXTRA","PreviousToken")+"\n"+changed[0]+"\n"+
      '_Static_assert(sizeof(void*)==4,"Wasm32 required");\n'+
      '_Static_assert(sizeof(PreviousToken)=='+(highBitDepth?8:6)+',"previous context layout");\n'+
      '_Static_assert(sizeof(TOKENEXTRA)=='+(highBitDepth?8:4)+',"packed layout");\n'+
      '_Static_assert(__builtin_offsetof(TOKENEXTRA,extra)=='+(highBitDepth?4:2)+',"extra field untruncated/aligned");\n'+
      "int within_previous_token_bytes=sizeof(PreviousToken);\nint within_packed_token_bytes=sizeof(TOKENEXTRA);\n",
      file=path.join(runtime.directory,"layout-"+highBitDepth+".c"),output=path.join(runtime.directory,"layout-"+highBitDepth+".ll");
    await writeFile(file,source,{flag:"wx"});
    await execute(compiler,["--target=wasm32-unknown-unknown","-std=c11","-Wall","-Wextra","-Werror","-S","-emit-llvm",file,"-o",output],options);
    const llvm=await readFile(output,"utf8");assert.match(llvm,/target triple = "wasm32-unknown-unknown"/);
    assert.match(llvm,new RegExp("@within_previous_token_bytes = .*i32 "+(highBitDepth?8:6)+","));
    assert.match(llvm,new RegExp("@within_packed_token_bytes = .*i32 "+(highBitDepth?8:4)+","));
    variants.push({highBitDepth,previousRecordBytes:highBitDepth?8:6,packedRecordBytes:highBitDepth?8:4,extraOffset:highBitDepth?4:2,
      cSourceSha256:sha(source),llvmSha256:sha(llvm)});
  }
}finally{await runtime.close();}
const cUnit=await runVp9TokenPackedCUnit(preimages),compact=rows=>Object.fromEntries(Object.entries(rows).map(([file,{generated,...row}])=>{void generated;return[file,row];})),
  report={recordedAt:new Date().toISOString(),scope:"Private four-byte token source/ABI/mock qualification; NOT a compiled or accepted browser conversion",
    sourceAudit:{file:auditFile,sha256:sha(auditBytes)},reviewedDomain,recipeSha256:sha(await readFile(path.join(root,"media/ffmpeg/vp9-token-packed-recipe.mjs"))),
    parentContextSources:compact(candidate.parentContextSources),sources:compact(candidate.sources),internalSentinel:candidate.internalSentinel,
    layout:{scope:"clang Wasm32 static assertions/LLVM; not linked codec",variants},cUnit,
    previousActualNativeRunId:42226266102,previousActualHighBitDepth:0,previousActualRecordBytes:6,
    candidateActualLibraryLayout:null,actualMemorySavedBytes:null,tokenCapacityChanged:false,entropyTokenValuesChanged:false,
    extraBitsChanged:false,memoryLimitsRaised:false,codecSettingsChanged:false,pixelAlgorithmsChanged:false,wasmCodecBuilt:false,
    browserValidated:false,independentBitExactBrowserControlPassed:false,speedGainProven:false,publicAcceptance:false,userMediaReadOrConverted:false,
    sourceDownloadFailure:{endpoint:"github.com",code:"UND_ERR_CONNECT_TIMEOUT",alternative:"Same archive via codeload.github.com; exact SHA256 verified"},
    nextAction:"Distinct full native compilation with actual library layout/source authentication; then unchanged strict bit-exact/fidelity/recovery and original browser gates. Never infer actual savings or speed from record layout alone."};
await writeFile(path.join(root,"evidence/2026-11-06-vp9-token-packed-source-qualification.json"),JSON.stringify(report,null,2)+"\n",{flag:"wx"});
console.log(JSON.stringify({layout:variants.map(v=>[v.highBitDepth,v.previousRecordBytes,v.packedRecordBytes]),
  producerPackerCases:cUnit.variants.reduce((n,v)=>n+v.producerPackerCases,0),actualMemorySavedBytes:null,wasmCodecBuilt:false}));
