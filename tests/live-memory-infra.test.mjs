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

for (const wasmCompilation of [false, true]) test(`mock-only during-work trace serializes bounded light dumps; compilation events=${wasmCompilation}`, async () => {
  const runtime = await createOwnedRuntimeScratch("live-memory-unit-"), session = new EventEmitter(), calls = [];
  let sequence = 0, active = 0, maximumActive = 0;
  session.send = async (method, params) => {
    calls.push({ method, params });
    if (method === "Tracing.requestMemoryDump") {
      active++; maximumActive = Math.max(maximumActive, active); const id = ++sequence;
      await new Promise(resolve => setTimeout(resolve, 15)); active--; return { success: true, dumpGuid: "0x" + id };
    }
    if (method === "Tracing.end") queueMicrotask(() => session.emit("Tracing.tracingComplete", { stream: "fake", dataLossOccurred: false }));
    if (method === "IO.read") return { data: JSON.stringify({ traceEvents: Array.from({ length: sequence }, (_, i) => [
      { name: "GlobalMemoryDump", ph: "b", pid: 1, id2: { local: String(i) }, ts: 10 + i * 30, args: { dump_guid: "0x" + (i + 1) } },
      { name: "GlobalMemoryDump", ph: "e", pid: 1, id2: { local: String(i) }, ts: 20 + i * 30 },
      { ph: "v", pid: 2, ts: 15 + i * 30, args: { dumps: { allocators: {} } } },
    ]).flat() }), eof: true };
  };
  session.detach = async () => calls.push({ method: "detach" });
  try {
    const result = await captureLiveMemoryInfra({ session, phase: "mock-work", processes: [], archivePath: path.join(runtime.directory, "trace.json.gz"),
      during: () => new Promise(resolve => setTimeout(resolve, 380)), wasmCompilation });
    assert.deepEqual(calls.find(call => call.method === "Tracing.start").params.traceConfig.includedCategories,
      ["disabled-by-default-memory-infra", ...(wasmCompilation ? ["v8.wasm", "v8.wasm.detailed"] : [])]);
    assert.equal(result.wasmCompilationEventsIncluded, wasmCompilation);
    assert.ok(result.rows.length >= 1 && result.rows.length <= 4); assert.equal(maximumActive, 1);
    assert.ok(result.rows.some(row => row.workRunningAtRequest)); assert.equal(result.summary.length, result.rows.length);
    assert.equal(result.acceptanceMetric, false); assert.equal(result.perturbsMemory, true); assert.equal(calls.at(-1).method, "detach");
  } finally { await runtime.close(); }
});

test("mock-only missing trace completion cannot hang cleanup or leave event listeners", async () => {
  const session = new EventEmitter(), calls = [];
  session.send = async method => { calls.push(method); if (method === "Tracing.requestMemoryDump") return { success: true, dumpGuid: "0x1" }; };
  session.detach = async () => calls.push("detach");
  const started = Date.now();
  await assert.rejects(captureLiveMemoryInfra({ session, phase: "mock-deadline", processes: [], archivePath: "not-written",
    captureMs: 15 }), /deadline/);
  assert.ok(Date.now() - started < 2000); assert.ok(calls.includes("Tracing.end")); assert.ok(calls.includes("detach"));
  assert.equal(session.listenerCount("Tracing.tracingComplete"), 0);
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
