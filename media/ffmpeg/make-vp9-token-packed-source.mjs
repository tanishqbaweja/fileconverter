// Private owned build only; actual source/ABI proof, never codec instantiation.
import assert from "node:assert/strict";
import {readFile,realpath,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
import {makeVp9TokenPackedSources} from "./vp9-token-packed-recipe.mjs";
import {verifyVp9TokenPackedAudit,VP9_PACKED_EXTRA_PINS} from "./vp9-token-packed-audit.mjs";
import {runVp9TokenPackedCUnit} from "./vp9-token-packed-c-unit.mjs";
assert.ok(process.argv.length===2||(process.argv.length===3&&process.argv[2]==="--layout"));
const root=path.resolve(import.meta.dirname,"../.."),build=path.join(root,"work/vp9-duration-build"),vendor=path.join(build,"libvpx"),
  proofFile=path.join(build,"vp9-token-packed-proof.json"),sha=s=>createHash("sha256").update(s).digest("hex"),
  stems={"vp9/encoder/vp9_tokenize.h":"vp9_tokenize.header","vp9/encoder/vp9_tokenize.c":"vp9_tokenize.producer","vp9/encoder/vp9_bitstream.c":"vp9_bitstream.packer"};
assert.equal(await realpath(build),build);assert.equal(await realpath(vendor),vendor);
if(process.argv[2]==="--layout") {
  const proof=JSON.parse(await readFile(proofFile));assert.equal(proof.layout,null);
  for(const [file,row]of Object.entries(proof.sources))assert.equal(sha(await readFile(path.join(vendor,file))),row.generatedSha256);
  const config=await readFile(path.join(vendor,"vpx_config.h"),"utf8"),match=config.match(/^#define CONFIG_VP9_HIGHBITDEPTH ([01])$/m);assert.ok(match);
  const high=Number(match[1]),previousBytes=high?8:6,packedBytes=high?8:4,
    source='#include "vp9/encoder/vp9_tokenize.h"\n'+
    'typedef struct {uint16_t context_tree_offset;int16_t token;EXTRABIT extra;} WithinPreviousToken;\n'+
    '_Static_assert(sizeof(void*)==4,"Wasm32 required");\n'+
    '_Static_assert(sizeof(WithinPreviousToken)=='+previousBytes+',"previous layout");\n'+
    '_Static_assert(sizeof(TOKENEXTRA)=='+packedBytes+',"packed layout");\n'+
    '_Static_assert(__builtin_offsetof(TOKENEXTRA,extra)=='+(high?4:2)+',"extra representation");\n'+
    'int within_previous_token_bytes=sizeof(WithinPreviousToken);\nint within_packed_token_bytes=sizeof(TOKENEXTRA);\n'+
    'int within_packed_highbitdepth=CONFIG_VP9_HIGHBITDEPTH;\n',
    file=path.join(build,"vp9-packed-layout-probe.c"),output=path.join(build,"vp9-packed-layout-probe.ll");
  await writeFile(file,source,{flag:"wx"});
  await promisify(execFile)("emcc",["-I"+vendor,"-std=c11","-S","-emit-llvm",file,"-o",output],{cwd:root,windowsHide:true,timeout:30000,maxBuffer:262144});
  const llvm=await readFile(output,"utf8");assert.match(llvm,/target triple = "wasm32-unknown-emscripten"/);
  for(const [symbol,value]of [["within_previous_token_bytes",previousBytes],["within_packed_token_bytes",packedBytes],["within_packed_highbitdepth",high]])
    assert.match(llvm,new RegExp("@"+symbol+" = .*i32 "+value+","));
  await writeFile(path.join(build,"vp9-packed-vpx-config.h"),config,{flag:"wx"});
  proof.layout={highBitDepth:high,previousRecordBytes:previousBytes,packedRecordBytes:packedBytes,extraOffset:high?4:2,
    actualLibraryConfiguration:true,vpxConfigSha256:sha(config),cSourceSha256:sha(source),llvmSha256:sha(llvm),codecInstantiated:false};
  await writeFile(proofFile,JSON.stringify(proof,null,2)+"\n");console.log(JSON.stringify({actualPackedLayout:proof.layout}));
}else {
  const auditBytes=await readFile(path.join(root,"evidence/2026-11-06-vp9-token-packed-source-audit.json")),audit=JSON.parse(auditBytes),
    domain=verifyVp9TokenPackedAudit(audit),preimages={};
  for(const file of Object.keys(VP9_PACKED_EXTRA_PINS)) {
    const target=path.join(vendor,file);assert.equal(await realpath(target),target);
    assert.equal(sha(await readFile(target)),VP9_PACKED_EXTRA_PINS[file]);
  }
  for(const [file,stem]of Object.entries(stems))preimages[file]=await readFile(path.join(build,stem+".base.c"),"utf8");
  const candidate=makeVp9TokenPackedSources(preimages),cUnit=await runVp9TokenPackedCUnit(preimages),proof={...candidate,sources:{},parentContextSources:{},
    reviewedDomain:domain,sourceAuditSha256:sha(auditBytes),actualVendorExtraPins:VP9_PACKED_EXTRA_PINS,cUnit,layout:null};
  for(const [file,{generated,...row}]of Object.entries(candidate.sources)) {
    assert.equal(await readFile(path.join(vendor,file),"utf8"),candidate.parentContextSources[file].generated);
    proof.sources[file]=row;const {generated:ancestor,...parentRow}=candidate.parentContextSources[file];void ancestor;proof.parentContextSources[file]=parentRow;
    await writeFile(path.join(build,stems[file]+".packed.c"),generated,{flag:"wx"});
  }
  await writeFile(proofFile,JSON.stringify(proof,null,2)+"\n",{flag:"wx"});
  for(const [file,{generated}]of Object.entries(candidate.sources)){await writeFile(path.join(vendor,file),generated);assert.equal(sha(await readFile(path.join(vendor,file))),sha(generated));}
  console.log(JSON.stringify({privatePackedTokensPatched:true,actualMemorySavedBytes:null,browserValidated:false}));
}
