// Preserve the actual blocked failed-global control. Change ONLY ordinary worker
// termination before the dump and honest expected availability, never GC/storage.
import assert from "node:assert/strict";
import { makePartialBlinkControl } from "./partial-blink-control-recipe.mjs";
export function makeQuiescedBlinkControl(source,root,resolvePackage){
  const prior=makePartialBlinkControl(source,root,resolvePackage);
  const patches=[
    ['2026-10-08-partial-blink-blocked-control-partial-blink-trace.json.gz','2026-10-08-partial-blink-quiesced-control-partial-blink-trace.json.gz'],
    ['let traceReport = null, failure = null, version = null, generatedHelper = null, identity = null, traceStarts = 0;',
      'let quiescence=null;\nlet traceReport = null, failure = null, version = null, generatedHelper = null, identity = null, traceStarts = 0;'],
    ['      assert.equal(traceStarts, 0); traceStarts++;',`      assert.equal(traceStarts, 0); traceStarts++;
      quiescence={startedAt:Date.now(),closedAt:null,actualWorkerCloseObserved:false,retainedSyntheticBytes:null,noForcedGc:true};
      const workers=page.workers().filter(w=>w.url().startsWith("data:text/javascript,"));assert.equal(workers.length,1);
      const workerClosed=new Promise(resolve=>workers[0].once("close",resolve));
      quiescence.retainedSyntheticBytes=await page.evaluate(()=>{
        globalThis.__partialDumpWorker.terminate();delete globalThis.__partialDumpWorker;
        return globalThis.__budgetFailureControl.length;
      });
      let timer;
      try{await Promise.race([workerClosed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Actual worker close deadline")),5000);})]);}
      finally{clearTimeout(timer);}
      quiescence.closedAt=Date.now();quiescence.actualWorkerCloseObserved=true;
      assert.equal(quiescence.retainedSyntheticBytes,264*1048576);`],
    ['assert.equal(capture.callback.result.success, false,"Failed global dump must NOT become success");',
      'assert.equal(capture.callback.result.success, true,"This CHANGED quiesced control requires actual global success");'],
    ['traceReport.status, "failed-diagnostic"','traceReport.status, "completed-diagnostic"'],
    ['trace.dumps[0].memoryDump.success,false','trace.dumps[0].memoryDump.success,true'],
    ['trace.allocatorSummary[0].globalRequestSucceeded,false','trace.allocatorSummary[0].globalRequestSucceeded,true'],
    ['trace.allocatorSummary[0].partialGlobalDump,true','trace.allocatorSummary[0].partialGlobalDump,false'],
    ['assert.ok(trace.allocatorSummary[0].processes.some(p=>p.blinkTypeStatistics?.length>0));',`assert.ok(trace.allocatorSummary[0].processes.some(p=>p.blinkTypeStatistics?.length>0));
  const target=capture.firstFailure.delta.processDeltas.toSorted((a,b)=>b.deltaPrivateBytes-a.deltaPrivateBytes)[0];
  const actualTarget=trace.allocatorSummary[0].processes.find(p=>p.pid===target.pid);assert.ok(actualTarget);
  assert.ok(actualTarget.blinkHeapStatistics.length>0);assert.ok(actualTarget.blinkTypeStatistics.length>0);
  assert.equal(quiescence.actualWorkerCloseObserved,true);
  assert.ok(quiescence.closedAt<=Date.parse(trace.dumps[0].timestamp));`],
    ['const files = ["scripts/probe-partial-blink-blocked.mjs",',
      'const files = ["scripts/probe-partial-blink-quiesced.mjs", "scripts/lib/partial-blink-quiesced-control-recipe.mjs", "evidence/partial-blink-blocked-control-verification-2026-10-08.json", "scripts/probe-partial-blink-blocked.mjs",'],
    ['actual-partial-global-dump-records-synthetic-blocked-worker-control-not-converter','actual-quiesced-worker-provider-recovery-synthetic-control-not-converter'],
    ['verified-partial-record-control-global-dump-failed','verified-quiesced-worker-record-control-global-dump-succeeded'],
    ['failed-partial-record-control','failed-quiesced-worker-record-control'],
    ['blankBaseline, traceStartsBeforeAllocation, traceStarts, allocationStartedAt,','quiescence,blankBaseline, traceStartsBeforeAllocation, traceStarts, allocationStartedAt,'],
    ['evidence/partial-blink-blocked-control-2026-10-08.json','evidence/partial-blink-quiesced-control-2026-10-08.json'],
    ['"partial-blink-blocked-control-"','"partial-blink-quiesced-control-"'],
    ['Global dump intentionally fails with a35second blocked synthetic worker;',
      'Changed control normally terminates the35second synthetic worker AFTER native failure and BEFORE dump, with actual close event and same retained264MiB touched storage; actual global success/provider recovery required. Historical blocked control remains failed-global;'],
  ];
  let result=prior;
  for(const[before,after]of patches){assert.equal(result.split(before).length,2,before);result=result.replace(before,after);}
  let reversed=result;
  for(const[before,after]of [...patches].reverse()){assert.equal(reversed.split(after).length,2,after);reversed=reversed.replace(after,before);}
  assert.equal(reversed,prior,"Only quiescence/actual expected recovery/provenance; fixed storage/flags/full-tree trigger unchanged");return result;
}
