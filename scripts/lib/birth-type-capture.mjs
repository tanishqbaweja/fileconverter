// Diagnostic role labels only. Never mutates/excludes native memory samples.
import assert from "node:assert/strict";
import {sampleChromiumTree} from "./chromium-private-memory.mjs";
import {startChromiumMemoryMonitor} from "./birth-aware-chromium-memory.mjs";
const allowed=new Set(["renderer","gpu-process","utility","zygote"]);
const microKey=p=>{const m=/^(.*T\d\d:\d\d:\d\d)(?:\.(\d{1,7}))?Z$/.exec(p.createdAt??"");
  assert.ok(m&&Number.isFinite(Date.parse(m[1]+"Z")));return `${p.pid}:${p.parentPid}:${m[1]}.${(m[2]??"").padEnd(6,"0").slice(0,6)}Z`;};
const flag=value=>typeof value==="string"&&/^[a-zA-Z0-9_.-]{1,256}$/.test(value)?value:null;
export function createBirthTypeCapture(rootPid,{query=sampleChromiumTree}={}) {
  assert.ok(Number.isSafeInteger(rootPid)&&rootPid>0);
  const records=new Map(),microBirths=new Map();let rootBirth=null,pending=null,closed=false,queries=0,globalError=null;
  const report=()=>({records:[...records.values()].map(({micro,...r})=>{void micro;return {...r};}),queries,maximumQueries:16,maximumIdentities:512,
    maximumPending:1,queuedRequests:0,queryTimeoutMs:5000,classificationPrecisionNanoseconds:1000,
    globalError,acceptanceMetric:false,memoryFormulaChanged:false,processesExcluded:false,primarySamplesMutated:false});
  return {
    report,
    observe(batch) {
      if(closed)return;
      try {
        const live=new Set();
        for(const s of batch.samples??[])for(const p of s.processes??[]) {
          const key=`${p.pid}:${p.creationFileTime}`,micro=microKey(p);live.add(key);
          if(records.has(key))continue;
          assert.ok(records.size<512,"Birth-type identity cap");
          const row={pid:p.pid,parentPid:p.parentPid,createdAt:p.createdAt,creationFileTime:p.creationFileTime,micro,
            status:"not-yet-queried",attempts:0,type:null,utilitySubtype:null,sandboxType:null,error:null};records.set(key,row);
          if(p.pid===rootPid){if(rootBirth!==null)assert.equal(rootBirth,micro,"Owned root birth changed");rootBirth=micro;}
          const previous=microBirths.get(micro);
          if(previous&&previous!==key){for(const k of [previous,key]){const r=records.get(k);r.status="ambiguous-birth-at-cim-precision";r.type=null;r.utilitySubtype=null;r.sandboxType=null;}}
          else microBirths.set(micro,key);
        }
        if(pending||queries>=16||rootBirth===null)return;
        const selected=[...records.entries()].filter(([key,r])=>live.has(key)&&r.attempts===0&&r.status==="not-yet-queried").map(([,r])=>r);
        if(!selected.length)return;assert.ok(selected.length<=128);queries++;for(const r of selected)r.attempts++;
        // Production query has its own5s hidden-process timeout. Keep this one
        // request pending until it really settles; no timeout-driven requeue.
        pending=(async()=>{
          try {
            const tree=await query(rootPid);assert.ok(Array.isArray(tree.processes)&&tree.processes.length<=128);
            const roots=tree.processes.filter(p=>p.pid===rootPid);assert.equal(roots.length,1);assert.equal(microKey(roots[0]),rootBirth,"CIM root birth mismatch");
            for(const r of selected) {
              if(r.status==="ambiguous-birth-at-cim-precision")continue;
              const matches=tree.processes.filter(p=>p.pid===r.pid&&microKey(p)===r.micro);
              if(matches.length!==1){r.status="not-in-matching-census";continue;}
              const p=matches[0];r.type=r.pid===rootPid?"browser":allowed.has(p.type)?p.type:null;
              if(r.type===null){r.status="type-unavailable";continue;}
              r.utilitySubtype=flag(p.utilitySubtype);r.sandboxType=flag(p.sandboxType);r.status="classified";
            }
          }catch(error){for(const r of selected){r.status="query-unavailable";r.type=null;r.utilitySubtype=null;r.sandboxType=null;r.error=String(error).slice(0,1024);}}
        })().finally(()=>{pending=null;});
      }catch(error){globalError??=String(error).slice(0,1024);}
    },
    async settled(){await pending;},
    async close(){closed=true;await pending;},
  };
}
export async function startClassifiedChromiumMemoryMonitor(rootPid,temporary,intervalMs=100) {
  const monitor=await startChromiumMemoryMonitor(rootPid,temporary,intervalMs),capture=createBirthTypeCapture(rootPid);let closing;
  return {...monitor,
    ownershipSummary:()=>({...monitor.ownershipSummary(),birthTypeCapture:capture.report()}),
    async drain(){const batch=await monitor.drain();capture.observe(batch);return batch;},
    close(){closing??=Promise.allSettled([capture.close(),monitor.close()]).then(results=>{
      const errors=results.filter(x=>x.status==="rejected").map(x=>x.reason);if(errors.length)throw new AggregateError(errors,"Every observer cleanup attempted");
    });return closing;},
  };
}
