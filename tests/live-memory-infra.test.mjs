import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import path from "node:path";
import { summarizeLiveMemory, captureLiveMemoryInfra, LIVE_MEMORY_LIMITS } from "../scripts/lib/live-memory-infra.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
test("Live memory counter projection retains overlapping V8 worker and malloc categories, missing scalars stay null",()=>{
  const trace={traceEvents:[{name:"GlobalMemoryDump",ph:"b",pid:1,id2:{local:"1"},ts:10,args:{dump_guid:"0x1"}},
    {name:"GlobalMemoryDump",ph:"e",pid:1,id2:{local:"1"},ts:20},
    {ph:"v",pid:2,ts:15,args:{dumps:{allocators:{"v8/workers/heap/new_space":{attrs:{size:{type:"scalar",units:"bytes",value:"100"}}},
      "malloc/allocated_objects":{attrs:{size:{type:"scalar",units:"bytes",value:"invalid"}}}}}}}]};
  const [row]=summarizeLiveMemory(trace,[{phase:"fixture-only",memoryDump:{success:true,dumpGuid:"0x1"}}]);
  assert.equal(row.processes[0].liveAllocatorCounters["v8/workers/heap/new_space"].size,256);
  assert.equal(row.processes[0].liveAllocatorCounters["malloc/allocated_objects"].size,null);
  assert.equal(row.summedAllocatorTotal,null);assert.equal(row.acceptanceMetric,false);
  assert.equal(LIVE_MEMORY_LIMITS.maximumCaptureMs,15000);
});
for(const overflow of [false,true])test(`Mock-only live trace ${overflow?"rejects oversized replies":"archives exact bytes"} and closes/detaches`,async()=>{
  const runtime=await createOwnedRuntimeScratch("live-memory-unit-");
  const calls=[],session=new EventEmitter();
  session.send=async(method,params)=>{
    calls.push({method,params});
    if(method==="Tracing.requestMemoryDump")return {success:true,dumpGuid:"0x1"};
    if(method==="Tracing.end")queueMicrotask(()=>session.emit("Tracing.tracingComplete",{stream:"fake",dataLossOccurred:false}));
    if(method==="IO.read")return {data:overflow?"x".repeat(LIVE_MEMORY_LIMITS.readBytes+1):JSON.stringify({traceEvents:[
      {name:"GlobalMemoryDump",ph:"b",pid:1,id2:{local:"1"},ts:10,args:{dump_guid:"0x1"}},
      {name:"GlobalMemoryDump",ph:"e",pid:1,id2:{local:"1"},ts:20},
      {ph:"v",pid:2,ts:15,args:{dumps:{allocators:{}}}}]}),eof:true};
  };session.detach=async()=>calls.push({method:"detach"});
  try{
    const operation=captureLiveMemoryInfra({session,phase:"mock-only",processes:[],archivePath:path.join(runtime.directory,"trace.json.gz")});
    if(overflow)await assert.rejects(operation);else{const value=await operation;assert.equal(value.acceptanceMetric,false);assert.equal(value.allocationStackAttribution,false);}
    assert.ok(calls.some(row=>row.method==="IO.close"));assert.equal(calls.at(-1).method,"detach");
    assert.equal(calls.find(row=>row.method==="Tracing.requestMemoryDump").params.deterministic,false);
  }finally{await runtime.close();}
});
