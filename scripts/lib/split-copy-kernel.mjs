// PRIVATE CPU/Wasm transport only. Not a codec, buffer-budget or conversion pass.
// No new memory: the module imports the two codec owners' EXISTING fixed heaps.
const check=(condition,message)=>{if(!condition)throw new Error(message);};
function plane(value,heapBytes){
  check(value&&["offset","stride","rowBytes","rows","allocationOffset","allocationBytes"].every(key=>Number.isSafeInteger(value[key])),"Invalid scalar copy layout");
  const {offset,stride,rowBytes,rows,allocationOffset,allocationBytes}=value;
  check(rowBytes>=1&&rowBytes<=4096&&rows>=1&&rows<=2160&&Math.abs(stride)>=rowBytes,"Copy dimensions/stride outside fixed limits");
  check(allocationOffset>=0&&allocationBytes>0&&allocationOffset+allocationBytes<=heapBytes,"Copy allocation outside heap");
  const last=offset+(rows-1)*stride;
  check(Math.min(offset,last)>=allocationOffset&&Math.max(offset,last)+rowBytes<=allocationOffset+allocationBytes,"Copy active rows outside native allocation");
}
export async function createSplitCopyKernel(module,decoderMemory,encoderMemory){
  check(module instanceof WebAssembly.Module,"Compiled transport module required");
  check(decoderMemory instanceof WebAssembly.Memory&&encoderMemory instanceof WebAssembly.Memory&&decoderMemory!==encoderMemory,"Independent actual codec memories required");
  check(decoderMemory.buffer instanceof SharedArrayBuffer&&encoderMemory.buffer instanceof SharedArrayBuffer,"Actual fixed shared codec heaps required");
  check(decoderMemory.buffer.byteLength===33554432&&encoderMemory.buffer.byteLength===16777216,"Exact32+16MiB memories required");
  let instance=await WebAssembly.instantiate(module,{heaps:{decoder:decoderMemory,encoder:encoderMemory}});
  check(typeof instance.exports.copy_rows==="function","Copy kernel export unavailable");
  let nativePlaneCalls=0,copiedBytes=0,closed=false;
  return Object.freeze({
    copyPlane(sourceHeap,targetHeap,from,to){
      check(!closed,"Copy kernel closed");
      check(sourceHeap instanceof Uint8Array&&sourceHeap.byteOffset===0&&sourceHeap.byteLength===33554432&&sourceHeap.buffer===decoderMemory.buffer
        &&targetHeap instanceof Uint8Array&&targetHeap.byteOffset===0&&targetHeap.byteLength===16777216&&targetHeap.buffer===encoderMemory.buffer,"Copy kernel heap identity changed");
      plane(from,33554432);plane(to,16777216);
      check(from.rowBytes===to.rowBytes&&from.rows===to.rows,"Copy kernel cannot resize/crop");
      const bytes=from.rowBytes*from.rows;check(Number.isSafeInteger(copiedBytes+bytes),"Copy scalar counter overflow");
      const contiguous=from.stride===from.rowBytes&&to.stride===to.rowBytes;
      const actual=instance.exports.copy_rows(to.offset,from.offset,contiguous?bytes:from.rowBytes,contiguous?1:from.rows,to.stride,from.stride);
      check(actual===bytes,"Native copy byte count mismatch");nativePlaneCalls++;copiedBytes+=bytes;
    },
    metrics:()=>Object.freeze({scope:"private-transport-not-conversion-acceptance",nativePlaneCalls,copiedBytes,closed,
      additionalWasmMemoryBytes:0,additionalPixelBufferBytes:0,queuedFrames:0}),
    close(){closed=true;instance=decoderMemory=encoderMemory=null;},
  });
}
