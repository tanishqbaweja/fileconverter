import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { summarizeMemoryInfraTrace } from "../scripts/lib/partial-largest-blink-type-summary.mjs";
import { summarizeMemoryInfraTrace as historical } from "../scripts/lib/largest-blink-type-summary.mjs";
import { makePartialBlinkAttribution } from "../scripts/lib/partial-blink-attribution-recipe.mjs";
import { makePartialBlinkControl } from "../scripts/lib/partial-blink-control-recipe.mjs";
import { makeQuiescedBlinkControl } from "../scripts/lib/partial-blink-quiesced-control-recipe.mjs";
const scalar=(value,units="bytes")=>({type:"scalar",units,value});
const rows=[{phase:"failed-budget-dump",memoryDump:{success:false,dumpGuid:"0x16"}}];
const events=[
  {name:"GlobalMemoryDump",ph:"b",pid:1,ts:10,id2:{local:"7"},args:{dump_guid:"0x16"}},
  {ph:"v",pid:2,ts:11,args:{dumps:{allocators:{
    "blink_gc/main/heap":{attrs:{size:scalar("1000"),allocated_objects_size:scalar("800")}},
    "blink_objects/blink_gc/main/ActualType":{attrs:{allocated_objects_size:scalar("400"),object_count:scalar("2","objects")}},
  }}}},
  {name:"GlobalMemoryDump",ph:"e",pid:1,ts:12,id2:{local:"7"}},
];
test("failed global dump keeps actual available types without turning failure, absent processes or fields into success/zeros",()=>{
  assert.throws(()=>historical({traceEvents:events},rows));
  const [summary]=summarizeMemoryInfraTrace({traceEvents:events},rows);
  assert.equal(summary.globalRequestSucceeded,false);assert.equal(summary.partialGlobalDump,true);
  assert.equal(summary.processes.length,1);assert.equal(summary.processes[0].pid,2);
  const heap=summary.processes[0].blinkHeapStatistics[0];assert.equal(heap.residentBytes,4096);
  assert.equal(heap.committedBytes,null);assert.equal(heap.allocatedObjectsBytes,2048);
  assert.equal(summary.processes[0].blinkTypeStatistics[0].allocatedObjectsBytes,1024);
  assert.equal(summary.summedAllocatorTotal,null);assert.equal(summary.acceptanceMetric,false);
  assert.equal(rows[0].memoryDump.success,false);
});
test("partial parser still rejects missing or ambiguous GUID intervals and cross-interval fabrication",()=>{
  assert.throws(()=>summarizeMemoryInfraTrace({traceEvents:events.slice(0,-1)},rows));
  assert.throws(()=>summarizeMemoryInfraTrace({traceEvents:[...events,events[0]]},rows));
  assert.throws(()=>summarizeMemoryInfraTrace({traceEvents:events},[{...rows[0],memoryDump:{success:false,dumpGuid:"wrong"}}]));
  assert.throws(()=>summarizeMemoryInfraTrace({traceEvents:events},[{...rows[0],memoryDump:{success:null,dumpGuid:"0x16"}}]));
});
test("successful global dumps retain exact historical allocator/types while partial parser adds disclosure only",()=>{
  const success=[{...rows[0],memoryDump:{success:true,dumpGuid:"0x16"}}];
  const old=historical({traceEvents:events},success)[0], changed=summarizeMemoryInfraTrace({traceEvents:events},success)[0];
  assert.deepEqual(changed.processes,old.processes);assert.equal(changed.globalRequestSucceeded,true);assert.equal(changed.partialGlobalDump,false);
});
test("changed helper retains raw trace inside repo with strict caps and does not suppress global dump failure",async()=>{
  const root=path.resolve(import.meta.dirname,"..");
  const source=await readFile(path.join(root,"scripts/lib/bounded-renderer-attribution.mjs"),"utf8");
  const result=makePartialBlinkAttribution(source,root,path.join(root,"outputs/reports/control-partial-blink-trace.json.gz"));
  for(const token of['chromiumBufferBytes: 4194304','maximumSerializedBytes: 16777216','dumps.some(row => !row.memoryDump?.success)','deterministic: false','flag:"wx"','compressed.length<=4194304'])assert.ok(result.includes(token),token);
  assert.throws(()=>makePartialBlinkAttribution(source+"\n",root,path.join(root,"outputs/reports/control-partial-blink-trace.json.gz")));
  assert.throws(()=>makePartialBlinkAttribution(source,root,path.join(root,"outside.json.gz")));
});
test("actual-browser prerequisite forces failed global request without files, converter or weakened primary trigger",async()=>{
  const root=path.resolve(import.meta.dirname,"..");
  const source=await readFile(path.join(root,"scripts/probe-native-budget-failure.mjs"),"utf8");
  const generated=makePartialBlinkControl(source,root,s=>import.meta.resolve(s));
  for(const token of['Date.now()+35000','264 * 1048576','capture.callback.result.success, false',
    'traceReport.status, "failed-diagnostic"','partialGlobalDump,true','globalThis.__partialDumpWorker?.terminate()',
    'originalRead: false, converterLoaded: false','maximumSerializedBytes','observeOwnedProcessExit']){
    // Trace caps reside in the separately pinned generated helper, not this driver.
    if(token==='maximumSerializedBytes')continue;
    assert.ok(generated.includes(token),token);
  }
  assert.throws(()=>makePartialBlinkControl(source+"\n",root,s=>import.meta.resolve(s)));
});
test("changed recovery control observes actual worker close while retaining same storage and historical failed-global case",async()=>{
  const root=path.resolve(import.meta.dirname,"..");const source=await readFile(path.join(root,"scripts/probe-native-budget-failure.mjs"),"utf8");
  const changed=makeQuiescedBlinkControl(source,root,s=>import.meta.resolve(s));
  for(const token of['workers[0].once("close"','quiescence.retainedSyntheticBytes,264*1048576',
    'actualTarget.blinkHeapStatistics.length>0','traceReport.status, "completed-diagnostic"','trace.allocatorSummary[0].partialGlobalDump,false'])assert.ok(changed.includes(token),token);
  assert.throws(()=>makeQuiescedBlinkControl(source+"\n",root,s=>import.meta.resolve(s)));
});
