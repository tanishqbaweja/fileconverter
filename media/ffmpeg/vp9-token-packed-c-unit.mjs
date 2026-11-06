// Actual pinned producer/packer snippets and mocked entropy writer, not conversion.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
import {createOwnedRuntimeScratch} from "../../scripts/lib/owned-runtime-scratch.mjs";
import {makeVp9TokenContextCUnit} from "./vp9-token-context-c-unit.mjs";
import {extractVp9TokenFunction} from "./vp9-token-context-recipe.mjs";
import {makeVp9TokenPackedSources} from "./vp9-token-packed-recipe.mjs";
export function makeVp9TokenPackedCUnit(preimages) {
  const candidate=makeVp9TokenPackedSources(preimages),producer="vp9/encoder/vp9_tokenize.c",packer="vp9/encoder/vp9_bitstream.c";
  let source=makeVp9TokenContextCUnit(preimages);
  const replace=(before,after)=>{assert.equal(source.split(before).length,2,before.slice(0,128));source=source.replace(before,after);};
  const declaration=candidate.sources["vp9/encoder/vp9_tokenize.h"].generated.match(/typedef struct \{\n  uint16_t context_tree_index[^}]+\} TOKENEXTRA;/);assert.ok(declaration);
  replace("typedef struct { uint16_t context_tree_offset; int16_t token; EXTRABIT extra; } CandidateToken;",declaration[0].replace("TOKENEXTRA","CandidateToken"));
  replace("#define EOSB_TOKEN 127","#define EOSB_TOKEN 127\n#define WITHIN_PACKED_EOSB_TOKEN 15\n#define ENTROPY_TOKENS 12");
  for(const [file,signature,name]of [[producer,"static INLINE void add_token(","add_token"],
    [producer,"static INLINE void add_token_no_extra(","add_token_no_extra"],[packer,"static void pack_mb_tokens(","pack_mb_tokens"]]) {
    const adapt=text=>text.replaceAll("TOKENEXTRA","CandidateToken").replace(new RegExp("\\b"+name+"\\(","g"),"candidate_"+name+"(");
    replace(adapt(extractVp9TokenFunction(candidate.parentContextSources[file].generated,signature)),
      adapt(extractVp9TokenFunction(candidate.sources[file].generated,signature)).replaceAll("EOSB_TOKEN","WITHIN_PACKED_EOSB_TOKEN"));
  }
  replace("base+changed[i].context_tree_offset","base+changed[i].context_tree_index*UNCONSTRAINED_NODES");
  replace("op->token=EOSB_TOKEN;cp->token=EOSB_TOKEN;","op->token=EOSB_TOKEN;cp->token=WITHIN_PACKED_EOSB_TOKEN;");
  replace("assert(sizeof(CandidateToken)==(CONFIG_VP9_HIGHBITDEPTH?8:6));",
    "assert(sizeof(CandidateToken)==(CONFIG_VP9_HIGHBITDEPTH?8:4));\n"+
    " for(unsigned value=0;value<65536;++value) {\n"+
    "  CandidateToken x={0};x.extra=(EXTRABIT)(int16_t)value;\n"+
    "  assert(x.extra==(EXTRABIT)(int16_t)value);\n"+
    "  for(unsigned token=0;token<12;++token){x.token=token;assert(x.token==token);}\n"+
    "  x.token=WITHIN_PACKED_EOSB_TOKEN;assert(x.token==15);\n"+
    " }\n"+
    " for(unsigned context=0;context<1024;++context){CandidateToken x={0};x.context_tree_index=context;assert(x.context_tree_index==context);}\n"+
    " OriginalToken a[1]={{0}};CandidateToken b[1]={{0}};a[0].token=EOSB_TOKEN;b[0].token=WITHIN_PACKED_EOSB_TOKEN;\n"+
    " OriginalToken *ap=a;CandidateToken *bp=b;vpx_writer aw={0},bw={0};unsigned char base[1728]={0};\n"+
    " original_pack_mb_tokens(&aw,&ap,a+1,8);candidate_pack_mb_tokens(&bw,&bp,b+1,8,base);\n"+
    " assert(ap==a+1&&bp==b+1&&aw.used==0&&bw.used==0);");
  return source;
}
export async function runVp9TokenPackedCUnit(preimages) {
  const root=path.resolve(import.meta.dirname,"../..");
  if(!preimages)preimages=Object.fromEntries(Object.entries(JSON.parse(await readFile(path.join(root,
    "evidence/2026-11-06-vp9-token-context-source-audit.json"))).preimages).map(([f,v])=>[f,v.exactSource]));
  const source=makeVp9TokenPackedCUnit(preimages),runtime=await createOwnedRuntimeScratch("vp9-token-packed-c-unit-"),execute=promisify(execFile),
    compiler=process.env.WITHIN_HOST_CC??(process.platform==="linux"?"/usr/bin/cc":"cc"),
    options={cwd:root,env:runtime.env,windowsHide:true,timeout:30000,maxBuffer:262144};
  try {
    const file=path.join(runtime.directory,"unit.c");await writeFile(file,source,{flag:"wx"});const variants=[];
    for(const highBitDepth of [0,1])for(const optimization of ["-O0","-O2"]) {
      const binary=path.join(runtime.directory,"unit-"+highBitDepth+optimization+(process.platform==="win32"?".exe":""));
      await execute(compiler,["-std=c11",optimization,"-Wall","-Wextra","-Werror","-DCONFIG_VP9_HIGHBITDEPTH="+highBitDepth,file,"-o",binary],options);
      const result=await execute(binary,[],options),numbers=result.stdout.trim().split(/\s+/).map(Number);
      assert.deepEqual(numbers,[69120*(highBitDepth?3:1),highBitDepth?8:4]);assert.equal(result.stderr,"");
      variants.push({highBitDepth,optimization,producerPackerCases:numbers[0],candidateRecordBytes:numbers[1],extraBitPatterns:65536,contextIndices:1024});
    }
    return {scope:"Exact pinned original/packed producer/packer snippets with mocked entropy writer, NOT codec or browser acceptance",
      sourceSha256:createHash("sha256").update(source).digest("hex"),variants,actualMemorySavedBytes:null,
      nativeCodecConversion:false,browserValidated:false,publicAcceptance:false};
  }finally{await runtime.close();}
}
