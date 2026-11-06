// Actual producer/packer snippets, mocked entropy writer; never native conversion.
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import path from "node:path";
import {createHash} from "node:crypto";
import {createOwnedRuntimeScratch} from "../../scripts/lib/owned-runtime-scratch.mjs";
import {extractVp9TokenFunction,makeVp9TokenContextSources} from "./vp9-token-context-recipe.mjs";
export function makeVp9TokenContextCUnit(preimages) {
  const candidate=makeVp9TokenContextSources(preimages),producer="vp9/encoder/vp9_tokenize.c",packer="vp9/encoder/vp9_bitstream.c";
  const snippets=(sources,old)=>["add_token","add_token_no_extra"].map(name=>
    extractVp9TokenFunction(sources[producer],"static INLINE void "+name+"("))
    .concat(extractVp9TokenFunction(sources[packer],"static void pack_mb_tokens("))
    .join("\n").replaceAll("TOKENEXTRA",old?"OriginalToken":"CandidateToken")
    .replace(/\b(add_token_no_extra|add_token|pack_mb_tokens)\(/g,(_match,name)=>(old?"original_":"candidate_")+name+"(");
  return String.raw`#include <assert.h>
#include <stddef.h>
#include <stdint.h>
#include <stdio.h>
#include <string.h>
#define INLINE inline
#define UNCONSTRAINED_NODES 3
#define PIVOT_NODE 2
#define ZERO_TOKEN 0
#define ONE_TOKEN 1
#define TWO_TOKEN 2
#define CATEGORY1_TOKEN 5
#define EOB_TOKEN 11
#define EOSB_TOKEN 127
#define VPX_BITS_12 12
#define VPX_BITS_10 10
typedef unsigned char vpx_prob;
typedef int vpx_bit_depth_t;
#if CONFIG_VP9_HIGHBITDEPTH
typedef int32_t EXTRABIT;
#else
typedef int16_t EXTRABIT;
#endif
typedef struct { vpx_prob coef_probs[4][2][2][6][6][3]; } FRAME_CONTEXT;
typedef struct { const vpx_prob *context_tree; int16_t token; EXTRABIT extra; } OriginalToken;
typedef struct { uint16_t context_tree_offset; int16_t token; EXTRABIT extra; } CandidateToken;
typedef struct { int operations[2048]; unsigned used; } vpx_writer;
struct vp9_token { int value,len; };
typedef struct { const unsigned char *prob; int len; } vp9_extra_bit;
static struct vp9_token vp9_coef_encodings[12];
static unsigned char vp9_pareto8_full[255][8],probabilities[3][12][8];
static int vp9_coef_con_tree[8];
static vp9_extra_bit vp9_extra_bits[12];
#if CONFIG_VP9_HIGHBITDEPTH
static vp9_extra_bit vp9_extra_bits_high10[12],vp9_extra_bits_high12[12];
#endif
static void vpx_write(vpx_writer *w,int bit,int prob) {
 assert(bit==0||bit==1);assert(prob>=1&&prob<=255);assert(w->used+2<2048);
 w->operations[w->used++]=bit;w->operations[w->used++]=prob;
}
static void vpx_write_bit(vpx_writer *w,int bit){vpx_write(w,bit,128);}
static void vp9_write_tree(vpx_writer *w,const int *tree,const unsigned char *prob,int value,int bits,int skip) {
 assert(tree==vp9_coef_con_tree&&skip==0&&bits>0);
 for(int i=0;i<bits;++i)vpx_write(w,(value>>i)&1,prob[i]);
}
${snippets(preimages,true)}
${snippets(Object.fromEntries(Object.entries(candidate.sources).map(([file,v])=>[file,v.generated])),false)}
static int check_case(unsigned offset,int token,EXTRABIT extra,int bit_depth,int update,int shape) {
 FRAME_CONTEXT frame;unsigned char *base=(unsigned char *)&frame.coef_probs;
 for(unsigned i=0;i<sizeof(frame.coef_probs);++i)base[i]=(i%255)+1;
 OriginalToken original[8]={{0}},*op=original;CandidateToken changed[8]={{0}},*cp=changed;
 unsigned int old_counts[128]={0},new_counts[128]={0};
 if(shape==0) {
  original_add_token_no_extra(&op,base+offset,EOB_TOKEN,old_counts);
  candidate_add_token_no_extra(&cp,base+offset,EOB_TOKEN,new_counts,base);
 }
 if(shape!=2) {
  for(int i=0;i<2;++i) {
   original_add_token_no_extra(&op,base+offset,ZERO_TOKEN,old_counts);
   candidate_add_token_no_extra(&cp,base+offset,ZERO_TOKEN,new_counts,base);
  }
 }
 if(shape!=1) {
  original_add_token(&op,base+offset,token,extra,old_counts);
  candidate_add_token(&cp,base+offset,token,extra,new_counts,base);
 }
 assert(op-original==cp-changed);assert(!memcmp(old_counts,new_counts,sizeof(old_counts)));
 for(unsigned i=0;i<(unsigned)(op-original);++i) {
  assert(original[i].token==changed[i].token);assert(original[i].extra==changed[i].extra);
  assert(original[i].context_tree==base+changed[i].context_tree_offset);
 }
 op->token=EOSB_TOKEN;cp->token=EOSB_TOKEN;
 // Probability contents may change after tokenization; never snapshot values.
 if(update)for(unsigned i=0;i<sizeof(frame.coef_probs);++i)base[i]=255-(i%255);
 vpx_writer a={0},b={0};OriginalToken *oa=original;CandidateToken *ca=changed;
 original_pack_mb_tokens(&a,&oa,op+1,bit_depth);
 candidate_pack_mb_tokens(&b,&ca,cp+1,bit_depth,base);
 assert(oa-original==ca-changed);assert(a.used==b.used);
 assert(!memcmp(a.operations,b.operations,a.used*sizeof(int)));
 return 1;
}
int main(void) {
 for(int i=0;i<12;++i) {
  vp9_coef_encodings[i]=(struct vp9_token){i,6};
  for(int j=0;j<8;++j)for(int k=0;k<3;++k)probabilities[k][i][j]=1+(i+j+k*47)%255;
  vp9_extra_bits[i]=(vp9_extra_bit){probabilities[0][i],4};
#if CONFIG_VP9_HIGHBITDEPTH
  vp9_extra_bits_high10[i]=(vp9_extra_bit){probabilities[1][i],6};
  vp9_extra_bits_high12[i]=(vp9_extra_bit){probabilities[2][i],8};
#endif
 }
 for(int i=0;i<255;++i)for(int j=0;j<8;++j)vp9_pareto8_full[i][j]=1+(i+j)%255;
 unsigned cases=0;
 for(unsigned offset=0;offset+3<=sizeof(((FRAME_CONTEXT*)0)->coef_probs);offset+=3)
 for(int update=0;update<=1;++update)for(int shape=0;shape<3;++shape)
 for(int token=1;token<=10;++token)for(int sign=0;sign<=1;++sign)
 for(int depth=8;depth<=(CONFIG_VP9_HIGHBITDEPTH?12:8);depth+=2) {
  EXTRABIT extra=(EXTRABIT)((CONFIG_VP9_HIGHBITDEPTH?131070:32766)+sign);
  cases+=check_case(offset,token,extra,depth,update,shape);
 }
 assert(sizeof(CandidateToken)==(CONFIG_VP9_HIGHBITDEPTH?8:6));
 printf("%u %zu\n",cases,sizeof(CandidateToken));return 0;
}
`;
}
export async function runVp9TokenContextCUnit(preimages) {
  const root=path.resolve(import.meta.dirname,"../..");
  if(!preimages)preimages=Object.fromEntries(Object.entries(JSON.parse(await readFile(path.join(root,
    "evidence/2026-11-06-vp9-token-context-source-audit.json"))).preimages).map(([f,v])=>[f,v.exactSource]));
  const source=makeVp9TokenContextCUnit(preimages),runtime=await createOwnedRuntimeScratch("vp9-token-context-c-unit-"),
    execute=promisify(execFile),compiler=process.env.WITHIN_HOST_CC??(process.platform==="linux"?"/usr/bin/cc":"cc"),
    options={cwd:root,env:runtime.env,windowsHide:true,timeout:30000,maxBuffer:262144};
  try {
    const file=path.join(runtime.directory,"unit.c");await writeFile(file,source,{flag:"wx"});const variants=[];
    for(const highBitDepth of [0,1]) {
      const binary=path.join(runtime.directory,"unit-"+highBitDepth+(process.platform==="win32"?".exe":""));
      await execute(compiler,["-std=c11","-O0","-Wall","-Wextra","-Werror","-DCONFIG_VP9_HIGHBITDEPTH="+highBitDepth,file,"-o",binary],options);
      const result=await execute(binary,[],options),numbers=result.stdout.trim().split(/\s+/).map(Number);
      assert.deepEqual(numbers,[69120*(highBitDepth?3:1),highBitDepth?8:6]);assert.equal(result.stderr,"");
      variants.push({highBitDepth,producerPackerCases:numbers[0],candidateRecordBytes:numbers[1]});
    }
    return {scope:"Exact original/candidate token producer/packer snippets with mocked entropy writer, NOT codec/media or actual Wasm heap savings",
      sourceSha256:createHash("sha256").update(source).digest("hex"),variants,
      actualMemorySavedBytes:null,nativeCodecConversion:false,browserValidated:false,publicAcceptance:false};
  } finally {await runtime.close();}
}
