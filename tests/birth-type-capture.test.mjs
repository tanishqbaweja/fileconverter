import assert from "node:assert/strict";
import {test} from "node:test";
import {createBirthTypeCapture} from "../scripts/lib/birth-type-capture.mjs";
import {sampleChromiumTree} from "../scripts/lib/chromium-private-memory.mjs";
import {queryReliableProcessIdentity} from "../scripts/lib/reliable-owned-identity.mjs";
import {createOwnedRuntimeScratch} from "../scripts/lib/owned-runtime-scratch.mjs";
import {spawn} from "node:child_process";
const row=(pid,parentPid=1,fraction="1234567")=>({pid,parentPid,createdAt:"2026-11-06T12:00:00."+fraction+"Z",creationFileTime:"13438440000123456"+pid,
  privateBytes:100,rssBytes:200,type:"unknown",utilitySubtype:null,sandboxType:null}),root=row(1,0),
  batch=rows=>({samples:[{processes:[root,...rows],privateBytes:(rows.length+1)*100}]}),census=rows=>({processes:[{...root,type:"browser"},...rows]});
test("birth-role diagnostics preserve exact native memory batch and classify only PID/parent/microsecond-matched command flags",async()=>{
  const b=batch([row(2)]),before=structuredClone(b),c=createBirthTypeCapture(1,{query:async()=>census([{...row(2,1,"1234560"),type:"utility",utilitySubtype:"example.mojom.Service",sandboxType:"utility"}])});
  c.observe(b);await c.settled();assert.deepEqual(b,before);const report=c.report(),child=report.records.find(r=>r.pid===2);
  assert.equal(child.type,"utility");assert.equal(child.utilitySubtype,"example.mojom.Service");assert.equal(report.primarySamplesMutated,false);assert.equal(report.processesExcluded,false);
  assert.equal(report.acceptanceMetric,false);c.observe(b);await c.settled();assert.equal(c.report().queries,1);await c.close();
});
test("PID reuse, different parent, missing flags or unavailable census never invent service labels",async()=>{
  for(const response of [row(2,1,"1234570"),row(2,9),{...row(2),type:"browser"}]) {
    const c=createBirthTypeCapture(1,{query:async()=>census([response])});c.observe(batch([row(2)]));await c.settled();assert.equal(c.report().records.find(r=>r.pid===2).type,null);await c.close();
  }
  const c=createBirthTypeCapture(1,{query:async()=>{throw new Error("CIM unavailable");}});c.observe(batch([row(2)]));await c.settled();
  assert.equal(c.report().records.find(r=>r.pid===2).status,"query-unavailable");assert.equal(c.report().records.find(r=>r.pid===2).type,null);await c.close();
});
test("one pending query, no queue, late new births queried once after prior reply",async()=>{
  let release,calls=0;const c=createBirthTypeCapture(1,{query:async()=>{calls++;return new Promise(resolve=>{release=resolve;});}});
  c.observe(batch([row(2)]));c.observe(batch([row(2),row(3)]));assert.equal(calls,1);assert.equal(c.report().queries,1);
  release(census([{...row(2),type:"renderer"}]));await c.settled();c.observe(batch([row(2),row(3)]));assert.equal(calls,2);
  release(census([{...row(2),type:"renderer"},{...row(3),type:"utility"}]));await c.settled();assert.equal(c.report().records.find(r=>r.pid===3).type,"utility");await c.close();
});
test("ambiguous native births at CIM precision cannot inherit a role and total OS queries remain capped",async()=>{
  const c=createBirthTypeCapture(1,{query:async()=>census([{...row(2),type:"utility"}])}),first=row(2),second={...row(2,1,"1234568"),creationFileTime:"134384400001234568"};
  c.observe(batch([first,second]));await c.settled();assert.ok(c.report().records.filter(r=>r.pid===2).every(r=>r.type===null&&r.status==="ambiguous-birth-at-cim-precision"));await c.close();
  const capped=createBirthTypeCapture(1,{query:async()=>census([])});for(let i=2;i<24;i++){capped.observe(batch([row(i)]));await capped.settled();}
  assert.equal(capped.report().queries,16);assert.equal(capped.report().queuedRequests,0);await capped.close();
});
test("root birth mismatch cannot label another reused process tree",async()=>{
  const c=createBirthTypeCapture(1,{query:async()=>({processes:[{...root,createdAt:"2026-11-06T12:00:01.1234560Z"},{...row(2),type:"utility"}]})});
  c.observe(batch([row(2)]));await c.settled();assert.equal(c.report().records.find(r=>r.pid===2).type,null);
  assert.match(c.report().records.find(r=>r.pid===2).error,/root birth mismatch/);await c.close();c.observe(batch([row(4)]));assert.equal(c.report().records.length,2);
});
test("real Windows CIM role query on owned Node flag fixture; synthetic memory rows are not browser acceptance",{skip:process.platform!=="win32",timeout:30000},async()=>{
  const runtime=await createOwnedRuntimeScratch("birth-type-windows-unit-"),child=spawn(process.execPath,
    ["-e","setTimeout(()=>{},20000)","--","--type=utility","--utility-sub-type=within.metadata.mock","--service-sandbox-type=utility"],
    {env:runtime.env,windowsHide:true,stdio:"ignore"}),exited=new Promise((resolve,reject)=>{child.once("exit",resolve);child.once("error",reject);});
  let birth,capture;
  try {
    const parent=await queryReliableProcessIdentity(process.pid);birth=await queryReliableProcessIdentity(child.pid);assert.ok(parent&&birth);assert.equal(birth.parentPid,process.pid);
    capture=createBirthTypeCapture(process.pid,{query:sampleChromiumTree});
    const synthetic=[{...parent,creationFileTime:"134384400001234560",privateBytes:100,rssBytes:200,type:"unknown"},
      {...birth,creationFileTime:"134384400001234570",privateBytes:100,rssBytes:200,type:"unknown"}],input={samples:[{processes:synthetic,privateBytes:200}]},before=structuredClone(input);
    capture.observe(input);await capture.settled();assert.deepEqual(input,before);const typed=capture.report().records.find(r=>r.pid===child.pid);
    assert.equal(typed.type,"utility");assert.equal(typed.utilitySubtype,"within.metadata.mock");assert.equal(typed.sandboxType,"utility");assert.equal(capture.report().acceptanceMetric,false);
  }finally{
    try {await capture?.close();if(child.exitCode===null&&child.signalCode===null){const now=await queryReliableProcessIdentity(child.pid);assert.ok(birth);assert.deepEqual(now,birth);child.kill();}await exited;}
    finally{await runtime.close();}
  }
});
