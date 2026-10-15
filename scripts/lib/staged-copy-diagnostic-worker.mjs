// This isolates I/O, not media conversion or whole-profile acceptance. The copy
// loop below is extracted byte-exact from the actual production worker.
import assert from "node:assert/strict";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
import { createExclusiveStagedWriter } from "./exclusive-staged-writer.mjs";
export function makeStagedCopyDiagnosticWorker(source) {
  assert.equal(sha(source), "6349cbe78fe0c3ece7c7f285a4eb1f8b6a09155ab9a9f44319f9d12566791d68");
  const start = source.indexOf("        const buffer = new Uint8Array(copyChunkBytes);"), end = source.indexOf("        finalWritable = null;", start);
  assert.ok(start > 0 && end > start); const loop = source.slice(start, end);
  assert.equal(loop.match(/await finalWritable.write\(value\)/g)?.length, 1);
  const generated = `const createExclusiveStagedWriter=(${createExclusiveStagedWriter.toString()});
const SOURCE='copy-diagnostic-source.bin',OUTPUT='copy-diagnostic-output.bin',BYTES=6414309978;
let cancelled=false,busy=false;
const assertActive=()=>{if(cancelled)throw new DOMException('Copy cancelled','AbortError');};
const emitProgress=()=>{};
const faultMessage=kind=>new DOMException('Injected final-copy '+kind,kind==='quota'?'QuotaExceededError':'NotAllowedError');
self.onmessage=async({data})=>{
 if(data.op==='cancel'){cancelled=true;return;}
 if(busy){self.postMessage({id:data.id,error:{name:'InvalidStateError',message:'I/O already active'}});return;}
 busy=true;cancelled=false;let access=null,readAccess=null,finalWritable=null;
 try{
  const root=await navigator.storage.getDirectory();
  if(data.op==='generate'){
   const estimate=await navigator.storage.estimate();if(estimate.quota-estimate.usage<BYTES*2)throw new Error('Insufficient diagnostic quota');
   await root.removeEntry(SOURCE).catch(()=>{});
   const source=await root.getFileHandle(SOURCE,{create:true});access=await source.createSyncAccessHandle();access.truncate(0);
   const buffer=new Uint8Array(65536);for(let i=0;i<buffer.length;i++)buffer[i]=(i*31+17)&255;
   let at=0;while(at<BYTES){assertActive();const view=buffer.subarray(0,Math.min(buffer.length,BYTES-at));const n=access.write(view,{at});if(n!==view.length)throw new Error('Short diagnostic fixture write');at+=n;}
   access.flush();access.close();access=null;if((await source.getFile()).size!==BYTES)throw new Error('Fixture size mismatch');
   self.postMessage({id:data.id,result:{generatedBytes:at,maximumBufferBytes:buffer.length,sparse:false,mediaConversion:false}});
  }else if(data.op==='remove'){
   await root.removeEntry(OUTPUT);self.postMessage({id:data.id,result:{removed:true}});
  }else if(data.op==='copy'){
   const stagingHandle=await root.getFileHandle(SOURCE),stagedFile=await stagingHandle.getFile();if(stagedFile.size!==BYTES)throw new Error('Source fixture changed');
   const finalHandle=await root.getFileHandle(OUTPUT,{create:true}),nativeStream=await finalHandle.createWritable({keepExistingData:false});
   if(!['convenience','exclusive'].includes(data.mode))throw new Error('Invalid copy mode');
   finalWritable=data.mode==='exclusive'?createExclusiveStagedWriter(nativeStream):nativeStream;
   await finalWritable.truncate(0);readAccess=await stagingHandle.createSyncAccessHandle();
   const copyChunkBytes=524288,startedAt=performance.now(),jobId='storage-only',copyPhase='Copying staged MP4 to selected destination';
   const metrics={inputBytes:0,outputBytes:0,maxScratchReadChunkBytes:0,maxScratchWriteChunkBytes:0,maxWriteChunkBytes:0,queuedBytes:0,peakQueuedBytes:0,pendingOperations:0,peakPendingOperations:0};
   const testFault=data.fault;
   let lastYield=0;const yieldForCancellation=async bytes=>{if(data.cancelAfterBytes&&bytes>=data.cancelAfterBytes)cancelled=true;if(bytes-lastYield>=1048576){lastYield=bytes;await new Promise(resolve=>setTimeout(resolve,0));}assertActive();};
${loop}
   const result={mode:data.mode,outputBytes:metrics.outputBytes,elapsedMs:performance.now()-startedAt,metrics,writer:finalWritable.writerMetrics?.()??null,mediaConversion:false};
   finalWritable=null;self.postMessage({id:data.id,result});
  }else throw new Error('Unknown diagnostic operation');
 }catch(error){
  try{readAccess?.close();}catch{}readAccess=null;try{access?.close();}catch{}access=null;
  try{await finalWritable?.abort(error);}catch{}finalWritable=null;
  const root=await navigator.storage.getDirectory();await root.removeEntry(OUTPUT).catch(()=>{});
  self.postMessage({id:data.id,error:{name:String(error.name).slice(0,128),message:String(error.message).slice(0,512)},cleanup:{outputRemoved:true}});
 }finally{busy=false;}
};`;
  return { generated, generatedSha256: sha(generated), productionLoopSha256: sha(loop), productionWorkerSha256: sha(source),
    fixtureBytes: 6414309978, maximumBufferBytes: 524288, nativeConvertersUsed: false, mediaConversionAcceptance: false };
}
