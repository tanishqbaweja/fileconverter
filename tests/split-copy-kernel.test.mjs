// Synthetic CPU transport tests ONLY: not browser codec/fidelity/memory acceptance.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createSplitCopyKernel } from "../scripts/lib/split-copy-kernel.mjs";
import { makeSplitCopyFrameBridge,makeSplitCopySession,exposeSplitCodecMemory,makeSplitCopyAdapter } from "../scripts/lib/split-copy-kernel-recipe.mjs";
import { makeLateAllocatorAbortAdapter } from "../scripts/lib/mpeg2-late-allocator-abort-adapter.mjs";
import { copyMpeg2SplitPixels as originalCopy } from "../scripts/lib/mpeg2-split-frame-bridge.mjs";
const binary=await readFile(new URL("../media/ffmpeg/mpeg2-split-copy.wasm",import.meta.url));
const compiled=await WebAssembly.compile(binary);
const baseline=await readFile(new URL("../scripts/lib/mpeg2-split-frame-bridge.mjs",import.meta.url),"utf8");
const recipe=makeSplitCopyFrameBridge(baseline);
const candidate=await import("data:text/javascript;base64,"+Buffer.from(recipe.generated).toString("base64"));
const decoderMemory=new WebAssembly.Memory({initial:512,maximum:512,shared:true});
const encoderMemory=new WebAssembly.Memory({initial:256,maximum:256,shared:true});
const decoder={HEAPU8:new Uint8Array(decoderMemory.buffer)},encoder={HEAPU8:new Uint8Array(encoderMemory.buffer)};
const hash=bytes=>createHash("sha256").update(bytes).digest("hex");
function layout(width=18,height=10,pixelFormat="yuv420p",padding=0,negative=false){
  let cursor=256;
  return {width,height,pixelFormat,planes:[0,1,2].map(index=>{
    const rowBytes=index?width/2:width,rows=!index||pixelFormat==="yuv422p"?height:height/2;
    const stride=rowBytes+padding,allocationBytes=stride*rows+64;
    const plane={allocationOffset:cursor,allocationBytes,offset:cursor+(negative?(rows-1)*stride:0),stride:negative?-stride:stride};
    cursor+=allocationBytes+64;return plane;
  })};
}
function fill(frame){
  decoder.HEAPU8.fill(19);
  frame.planes.forEach((plane,index)=>{
    const rowBytes=index?frame.width/2:frame.width,rows=!index||frame.pixelFormat==="yuv422p"?frame.height:frame.height/2;
    for(let row=0;row<rows;row++)for(let x=0;x<rowBytes;x++)decoder.HEAPU8[plane.offset+row*plane.stride+x]=(row*13+x*7+index*31)&255;
  });
}
test("Actual142-byte multi-memory module imports only the existing fixed heaps and preserves pixels/padding/negative strides",async()=>{
  assert.equal(binary.length,142);assert.equal(hash(binary),"d666446d70374e2ee7dffba3459b01aa81523a5b9434cf8427a56311fb30c893");
  assert.deepEqual(WebAssembly.Module.imports(compiled),[{module:"heaps",name:"decoder",kind:"memory"},{module:"heaps",name:"encoder",kind:"memory"}]);
  const kernel=await createSplitCopyKernel(compiled,decoderMemory,encoderMemory);
  try {
    for(const format of ["yuv420p","yuv422p"]){
      for(const [sourcePad,targetPad,sourceNegative,targetNegative] of [[0,0,false,false],[7,11,false,false],[9,8,true,false],[8,9,false,true],[7,7,true,true]]){
        const source=layout(18,10,format,sourcePad,sourceNegative),target=layout(18,10,format,targetPad,targetNegative);fill(source);
        encoder.HEAPU8.fill(165);const expectedBytes=originalCopy(decoder,encoder,source,target),expected=hash(encoder.HEAPU8);
        encoder.HEAPU8.fill(165);const before=hash(decoder.HEAPU8);
        assert.equal(candidate.copyMpeg2SplitPixels(decoder,encoder,source,target,kernel),expectedBytes);
        assert.equal(hash(encoder.HEAPU8),expected);assert.equal(hash(decoder.HEAPU8),before);
      }
    }
    const source=layout(1920,804,"yuv420p",128),target=layout(1920,804,"yuv420p",32);fill(source);
    encoder.HEAPU8.fill(165);originalCopy(decoder,encoder,source,target);const expected=hash(encoder.HEAPU8);
    encoder.HEAPU8.fill(165);assert.equal(candidate.copyMpeg2SplitPixels(decoder,encoder,source,target,kernel),2315520);
    assert.equal(hash(encoder.HEAPU8),expected);assert.equal(kernel.metrics().nativePlaneCalls,33);
    assert.equal(kernel.metrics().additionalPixelBufferBytes,0);assert.equal(kernel.metrics().additionalWasmMemoryBytes,0);
    assert.throws(()=>decoderMemory.grow(1),RangeError);assert.throws(()=>encoderMemory.grow(1),RangeError);
  }finally{kernel.close();}
  assert.equal(kernel.metrics().closed,true);
  assert.throws(()=>candidate.copyMpeg2SplitPixels(decoder,encoder,layout(),layout(),kernel),/closed/);
});
test("All original guards precede any candidate write; mismatched heaps and invalid third plane fail without partial copying",async()=>{
  const kernel=await createSplitCopyKernel(compiled,decoderMemory,encoderMemory);
  try {
    encoder.HEAPU8.fill(165);const before=hash(encoder.HEAPU8),source=layout();
    for(const change of [value=>value.planes[2].allocationBytes=1,value=>value.planes[1].stride=1,value=>value.planes[2].offset=-1,
      value=>value.planes[2]={...value.planes[0]},value=>value.width=15,value=>value.pixelFormat="rgba"]){
      const bad=layout();change(bad);assert.throws(()=>candidate.copyMpeg2SplitPixels(decoder,encoder,source,bad,kernel));
      assert.equal(hash(encoder.HEAPU8),before);assert.equal(kernel.metrics().nativePlaneCalls,0);
    }
    const impostor={HEAPU8:new Uint8Array(new SharedArrayBuffer(16777216))};
    assert.throws(()=>candidate.copyMpeg2SplitPixels(decoder,impostor,source,layout(),kernel),/identity changed/);
  }finally{kernel.close();}
  const growable=new WebAssembly.Memory({initial:512,maximum:513,shared:true});
  await assert.rejects(createSplitCopyKernel(compiled,growable,encoderMemory),WebAssembly.LinkError);
});
test("Exact reversible frame/session/glue recipes preserve original codec/AVIO/lifetime sources",async()=>{
  assert.throws(()=>makeSplitCopyFrameBridge(baseline.replace("source, destination)","source, destinationChanged)")));
  const source=await readFile(new URL("../scripts/lib/mpeg2-split-session.mjs",import.meta.url),"utf8");
  const session=makeSplitCopySession(source);assert.equal(session.patches.length,3);assert.ok(session.generated.includes("getCopyKernel = null"));
  for(const name of ["within-mpeg2-split.mjs","split-encoder.mjs"]){
    const glue=await readFile(new URL("../work/mpeg2-split-pipeline-37739125738/"+name,import.meta.url),"utf8"),exposed=exposeSplitCodecMemory(glue);
    assert.equal(exposed.patches.length,1);assert.equal((exposed.generated.match(/new WebAssembly.Memory/g)??[]).length,(glue.match(/new WebAssembly.Memory/g)??[]).length);
    assert.ok(exposed.generated.includes('Module["withinSplitMemory"]=wasmMemory'));
  }
});
test("New adapter derives from the actual measured18330-byte old adapter, preserving all fatal-observer and native gates",async()=>{
  const args={};
  for(const [key,file] of Object.entries({stager:"scripts/stage-mpeg2-split-direct.mjs",stackHelper:"scripts/lib/bounded-wasm-abort-capture.mjs",
    snapshotHelper:"scripts/lib/late-refstruct-abort-snapshot.mjs",poolHelper:"scripts/lib/late-pool-abort-capture.mjs",
    allocatorHelper:"scripts/lib/late-pool-allocator-abort-capture.mjs",freeHeaderHelper:"scripts/lib/dlmalloc-free-header-inspection.mjs",
    controlProof:"evidence/late-pool-abort-control-2026-10-08.json",allocatorControlProof:"evidence/late-pool-allocator-abort-control-2026-10-08.json",
    layoutProof:"evidence/mpeg2-late-dlmalloc-layout-2026-10-08.json"})){
    const value=await readFile(new URL("../"+file,import.meta.url),"utf8");args[key]=key.endsWith("Proof")?JSON.parse(value):value;
  }
  const previous=makeLateAllocatorAbortAdapter(args);assert.equal(previous.adapterBytes,18330);
  assert.equal(previous.adapterSha256,"020b3bdc7d3902367358094a8db2d1fa990691443bdc4ec465c5b0ae34792837");
  const adapter=makeSplitCopyAdapter(previous.adapter);assert.equal(adapter.patches.length,6);
  assert.ok(adapter.generated.includes("core.withinSplitMemory, encoder.withinSplitMemory"));
});
