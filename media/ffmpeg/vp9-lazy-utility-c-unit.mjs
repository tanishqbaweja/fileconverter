// Exact C control snippets with mocked allocators/scalers, never media conversion.
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { createHash } from "node:crypto";
import { createOwnedRuntimeScratch } from "../../scripts/lib/owned-runtime-scratch.mjs";
import { makeVp9LazyUtilityFunctions,makeVp9LazyUtilityFilter } from "./vp9-lazy-utility-recipe.mjs";
export function makeVp9LazyUtilityCSource(original,filterSource) {
  const generated=makeVp9LazyUtilityFunctions(original),filter=makeVp9LazyUtilityFilter(filterSource);
  const old=(source,name)=>source.replace(/(alloc_util_frame_buffers|init_motion_estimation|vp9_scale_if_required)\(/,name+"(");
  return String.raw`#include <assert.h>
#include <setjmp.h>
#include <stdio.h>
#include <string.h>
#define REALTIME 1
#define NSTEP 1
#define DIAMOND 2
#define MI_SIZE 8
#define VPX_BITS_8 8
#define VPX_CODEC_MEM_ERROR 7
#define VP9_ENC_BORDER_IN_PIXELS 160
typedef int INTERP_FILTER;
typedef struct { void *buffer_alloc; int y_width,y_height,y_crop_width,y_crop_height,y_stride; } YV12_BUFFER_CONFIG;
typedef struct { int width,height,subsampling_x,subsampling_y,use_highbitdepth,byte_alignment,error,mi_cols,mi_rows,bit_depth; } VP9_COMMON;
typedef struct { int mode,lag_in_frames; } Config;
typedef struct { VP9_COMMON common; Config oxcf; int use_svc,ss_cfg; struct {struct {int search_method;} mv;} sf;
 struct {int scaled_temp_is_alloc,number_spatial_layers;YV12_BUFFER_CONFIG scaled_temp;}svc;
 YV12_BUFFER_CONFIG last_frame_uf,scaled_source,scaled_last_source; } VP9_COMP;
static VP9_COMP state;
static YV12_BUFFER_CONFIG reference;
static jmp_buf failure;
static int calls,fail_at,scaler,me_method,me_stride,marker;
static void vpx_internal_error(int *error,int code,const char *text) { assert(code==7&&text);*error=code;longjmp(failure,1); }
static int is_one_pass_svc(VP9_COMP *cpi) {return cpi->use_svc;}
static YV12_BUFFER_CONFIG *get_frame_new_buffer(VP9_COMMON *cm) {assert(cm==&state.common&&reference.buffer_alloc);return &reference;}
static int vpx_realloc_frame_buffer(YV12_BUFFER_CONFIG *frame,int w,int h,int sx,int sy,
#if CONFIG_VP9_HIGHBITDEPTH
int high,
#endif
int border,int alignment,void *a,void *b,void *c) {
 assert(sx==1&&sy==1&&border==160&&alignment==0&&!a&&!b&&!c);
#if CONFIG_VP9_HIGHBITDEPTH
 assert(high==state.common.use_highbitdepth);
#endif
 ++calls;if(calls==fail_at)return -1;
 frame->buffer_alloc=&marker;frame->y_crop_width=w;frame->y_crop_height=h;
 frame->y_width=(w+7)&~7;frame->y_height=(h+7)&~7;frame->y_stride=(frame->y_width+320+31)&~31;return 0;
}
static void vp9_init3smotion_compensation(int *p,int stride) {assert(p==&state.ss_cfg);me_method=1;me_stride=stride;}
static void vp9_init_dsmotion_compensation(int *p,int stride) {assert(p==&state.ss_cfg);me_method=2;me_stride=stride;}
static void capture(YV12_BUFFER_CONFIG *u,YV12_BUFFER_CONFIG *s,int type) {assert(u&&s->buffer_alloc&&s->y_stride==2240);scaler=type;}
static void vp9_scale_and_extend_frame(YV12_BUFFER_CONFIG *u,YV12_BUFFER_CONFIG *s,INTERP_FILTER f,int p) {assert(f==3&&p==0);capture(u,s,1);}
#if CONFIG_VP9_HIGHBITDEPTH
static void scale_and_extend_frame(YV12_BUFFER_CONFIG *u,YV12_BUFFER_CONFIG *s,int depth,INTERP_FILTER f,int p) {assert(depth==10&&f==3&&p==0);capture(u,s,2);}
static void vp9_scale_and_extend_frame_nonnormative(YV12_BUFFER_CONFIG *u,YV12_BUFFER_CONFIG *s,int depth) {assert(depth==state.common.bit_depth);capture(u,s,3);}
#else
static void vp9_scale_and_extend_frame_nonnormative(YV12_BUFFER_CONFIG *u,YV12_BUFFER_CONFIG *s) {capture(u,s,3);}
#endif
${old(original.allocation,"original_allocate")}
${generated.allocation.generated}
${old(original.motion,"original_motion")}
${generated.motion.generated}
${old(original.scale,"original_scale")}
${generated.scale.generated}
static void lazy_filter_setup(VP9_COMP *cpi) {
 const VP9_COMMON *const cm=&cpi->common;
${filter.edits[0][1]}
 assert(cpi->last_frame_uf.buffer_alloc&&cpi->last_frame_uf.y_stride==2240);
}
static void setup(int mode,int lag,int svc,int high) {
 memset(&state,0,sizeof(state));memset(&reference,0,sizeof(reference));
 state.common.width=1920;state.common.height=804;state.common.mi_cols=240;state.common.mi_rows=101;
 state.common.subsampling_x=state.common.subsampling_y=1;state.common.use_highbitdepth=high;state.common.bit_depth=high?10:8;
 state.oxcf.mode=mode;state.oxcf.lag_in_frames=lag;state.use_svc=svc;state.svc.number_spatial_layers=3;
 reference.buffer_alloc=&marker;reference.y_stride=2240;calls=fail_at=scaler=me_method=me_stride=0;
}
typedef void (*Allocate)(VP9_COMP*);
typedef struct {int error,calls,last,source,previous,svc;} Result;
static Result allocate(Allocate fn,int mode,int lag,int svc,int high,int fail) {
 setup(mode,lag,svc,high);fail_at=fail;if(!setjmp(failure))fn(&state);
 Result result={state.common.error,calls,state.last_frame_uf.buffer_alloc!=NULL,state.scaled_source.buffer_alloc!=NULL,state.scaled_last_source.buffer_alloc!=NULL,state.svc.scaled_temp_is_alloc};return result;
}
int main(void) {
 int pairs=0,scales=0,motions=0,filters=0,transitions=0;
 for(int high=0;high<=CONFIG_VP9_HIGHBITDEPTH;++high) {
  for(int mode=0;mode<=1;++mode)for(int lag=0;lag<=1;++lag)for(int svc=0;svc<=1;++svc)for(int fail=0;fail<=4;++fail) {
   Result a=allocate(original_allocate,mode,lag,svc,high,fail),b=allocate(alloc_util_frame_buffers,mode,lag,svc,high,fail);++pairs;
   if(mode==REALTIME&&lag==0&&!svc) {assert(b.error==0&&b.calls==0&&!b.last&&!b.source&&!b.previous);assert(a.calls>0);}
   else assert(memcmp(&a,&b,sizeof(a))==0);
  }
  for(int mode=0;mode<=1;++mode)for(int lag=0;lag<=1;++lag)for(int svc=0;svc<=1;++svc)for(int method=0;method<3;++method) {
   setup(mode,lag,svc,high);original_allocate(&state);state.sf.mv.search_method=method;original_motion(&state);int before_method=me_method,before_stride=me_stride;
   setup(mode,lag,svc,high);alloc_util_frame_buffers(&state);state.sf.mv.search_method=method;init_motion_estimation(&state);
   assert(before_method==me_method&&before_stride==me_stride);++motions;
  }
  for(int norm=0;norm<=1;++norm)for(int geometry=0;geometry<3;++geometry)for(int fail=0;fail<=1;++fail) {
   setup(REALTIME,0,0,high);original_allocate(&state);
   YV12_BUFFER_CONFIG input={0};input.y_width=geometry==0?1920:geometry==1?640:4096;input.y_height=geometry==0?808:geometry==1?360:2048;
   YV12_BUFFER_CONFIG *a=original_scale(&state.common,&input,&state.scaled_source,norm,3,0);
   int old_scaler=scaler,old_returns_input=a==&input;
   setup(REALTIME,0,0,high);fail_at=fail;
   YV12_BUFFER_CONFIG *b=NULL;if(!setjmp(failure))b=vp9_scale_if_required(&state.common,&input,&state.scaled_source,norm,3,0);
   if(fail&&geometry) {assert(state.common.error==7&&scaler==0&&calls==1&&!b);}
   else {assert(!state.common.error&&old_scaler==scaler&&old_returns_input==(b==&input));assert(calls==(geometry!=0));}
   ++scales;
  }
  for(int fail=0;fail<=1;++fail)for(int previous=0;previous<=1;++previous) {
   setup(REALTIME,0,0,high);if(previous) {state.last_frame_uf.buffer_alloc=&marker;state.last_frame_uf.y_crop_width=320;}
   fail_at=fail;if(!setjmp(failure))lazy_filter_setup(&state);assert(state.common.error==(fail?7:0));assert(calls==1);++filters;
  }
  setup(REALTIME,0,0,high);alloc_util_frame_buffers(&state);assert(calls==0);++transitions;
  state.oxcf.mode=0;alloc_util_frame_buffers(&state);assert(calls==3);++transitions;
  state.oxcf.mode=REALTIME;alloc_util_frame_buffers(&state);assert(calls==3&&state.scaled_source.buffer_alloc);++transitions;
 }
 printf("%d %d %d %d %d\n",pairs,scales,motions,filters,transitions);return 0;
}
`;
}
export async function runVp9LazyUtilityCUnit(original,filterSource) {
  const root=path.resolve(import.meta.dirname,"../..");
  if(!original) {
    const audit=JSON.parse(await readFile(path.join(root,"evidence/2026-11-06-vp9-utility-buffer-source-audit.json")));
    original={allocation:audit.functions.alloc_util_frame_buffers.exactSource,motion:audit.functions.init_motion_estimation.exactSource,scale:audit.functions.vp9_scale_if_required.exactSource};
    filterSource=JSON.parse(await readFile(path.join(root,"evidence/2026-11-06-vp9-lazy-utility-source.json"))).exactSource;
  }
  const source=makeVp9LazyUtilityCSource(original,filterSource),runtime=await createOwnedRuntimeScratch("vp9-lazy-utility-c-unit-"),execute=promisify(execFile),
    compiler=process.env.WITHIN_HOST_CC??(process.platform==="linux"?"/usr/bin/cc":"cc"),
    options={cwd:root,env:runtime.env,windowsHide:true,timeout:30000,maxBuffer:262144};
  try {
    const file=path.join(runtime.directory,"unit.c");await writeFile(file,source,{flag:"wx"});const variants=[];
    for(const highBitDepth of [0,1]) {
      const binary=path.join(runtime.directory,"unit-"+highBitDepth+(process.platform==="win32"?".exe":""));
      await execute(compiler,["-std=c11","-O0","-Wall","-Wextra","-Werror","-DCONFIG_VP9_HIGHBITDEPTH="+highBitDepth,file,"-o",binary],options);
      const result=await execute(binary,[],options),numbers=result.stdout.trim().split(/\s+/).map(Number),factor=highBitDepth+1;
      assert.deepEqual(numbers,[40,12,24,4,3].map(n=>n*factor));assert.equal(result.stderr,"");
      variants.push({highBitDepth,allocationPairs:numbers[0],scalingCases:numbers[1],motionCases:numbers[2],filterCases:numbers[3],transitionCalls:numbers[4]});
    }
    return {scope:"Host-compiled exact utility control snippets with mocked allocators/scalers, NOT actual codec/fidelity or heap savings",
      sourceSha256:createHash("sha256").update(source).digest("hex"),variants,actualMemorySavedBytes:null,nativeCodecConversion:false,publicAcceptance:false};
  } finally {await runtime.close();}
}
