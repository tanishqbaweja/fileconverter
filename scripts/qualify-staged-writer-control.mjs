// Isolated real production saver A/B, NOT a video conversion or release gate.
import "./lib/hidden-unit-subprocesses.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, readdir, statfs, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import path from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { gzipSync } from "node:zlib";
import { chromium } from "playwright";
import { createOwnedRuntimeScratch, finishOwnedCleanup } from "./lib/owned-runtime-scratch.mjs";
import { startOwnedProductionTestServer } from "./lib/owned-production-test-server.mjs";
import { inspectInstalledChromePin } from "./lib/installed-chrome-pin.mjs";
import { inspectStressHostMemory } from "./lib/host-memory-preflight.mjs";
import { queryReliableProcessIdentity } from "./lib/reliable-owned-identity.mjs";
import { startChromiumMemoryMonitor } from "./lib/birth-aware-chromium-memory.mjs";
import { stableWindow } from "./lib/chromium-private-memory.mjs";
import { cleanupOwnedChromium, queryObservedPidCensus } from "./lib/owned-chromium-cleanup.mjs";
import { reconcileChromiumBirths } from "./lib/reconcile-chromium-births.mjs";
import { classifyPrivateRequest } from "./lib/private-browser-request.mjs";
import { isCompatibilityStaticPath } from "./lib/installed-compatibility-plan.mjs";
import { buildStagedWriterControl, STAGED_WRITER_CONTROL as plan, summarizeStagedWriterTiming } from "./lib/staged-writer-control.mjs";
import { encodeBoundedValidationChunk } from "./lib/bounded-validation-chunk.mjs";
import { bindLargeDocumentOutputValidationBacking, assertOpfsOutputValidationBackingUnchanged } from "./lib/opfs-output-validation-backing.mjs";
const root=path.resolve(import.meta.dirname,".."),stamp=new Date().toISOString().replaceAll(/[:.]/g,"-"),sha=b=>createHash("sha256").update(b).digest("hex");
const base=`evidence/${stamp}-staged-writer-control`;
const r={schemaVersion:1,startedAt:new Date().toISOString(),scope:"Isolated real saver256MiB pattern-file A/B. App loaded, same fixed buffer and real handles; NOT video conversion/original/scaling/public acceptance",headless:true,browserServicesDisabled:false,plan,cases:[],failures:[],requests:0,forbiddenRequests:[],sourcePins:{},wholeGoalComplete:false};
let runtime,server,chrome,browser,identity,monitor,page,controlStart=null;const samples=[];
async function drain(){if(!monitor)return;const batch=await monitor.drain();assert.ok(samples.length+batch.samples.length<=10000);samples.push(...batch.samples);
  if(controlStart!==null&&r.blank){for(const s of batch.samples)if(Date.parse(s.timestamp)>=controlStart&&s.privateBytes!==null)assert.ok((s.privateBytes-r.blank.privateBytes)/1048576<=250,"Unchanged complete-tree memory limit exceeded");}}
async function stable(){const points=[];for(let n=0;n<45;n++){await drain();const s=samples.at(-1);if(s?.privateBytes!==null&&s?.privateBytes!==undefined)points.push({...s,elapsedMs:points.length?Date.parse(s.timestamp)-Date.parse(points[0].timestamp):0});const ready=stableWindow(points);if(ready)return ready;await pause(1000);}throw Error("Stable original-baseline observation unavailable");}
async function port(){const p=createServer();await new Promise((resolve,reject)=>{p.once("error",reject);p.listen(0,"127.0.0.1",resolve);});const n=p.address().port;await new Promise(resolve=>p.close(resolve));return n;}
const generator=`self.onmessage=async({data:m})=>{let access;try{const root=await navigator.storage.getDirectory(),handle=await root.getFileHandle(m.name,{create:true});access=await handle.createSyncAccessHandle();access.truncate(0);const b=new Uint8Array(1048576);for(let i=0;i<b.length;i++)b[i]=i&255;for(let at=0;at<m.bytes;){const n=Math.min(b.length,m.bytes-at);if(access.write(b.subarray(0,n),{at})!==n)throw Error("Short fixture write");at+=n;}access.flush();access.close();access=null;self.postMessage({type:"generated",bytes:m.bytes});}catch(e){self.postMessage({type:"error",message:String(e)});}finally{access?.close();}};`;
try{
  assert.equal(process.argv.length,2);r.host=await inspectStressHostMemory();assert.equal(r.host.safeToStart,true);const disk=await statfs(root);assert.ok(disk.bavail*disk.bsize>=2*1024**3);
  const arms=await buildStagedWriterControl(root);r.singleFactor=arms.proof;r.compiledArms=Object.fromEntries(Object.entries(arms.arms).map(([k,v])=>[k,{bytes:v.bytes,sha256:v.sha256,runtimeSha256:v.runtimeSha256}]));
  for(const file of ["scripts/qualify-staged-writer-control.mjs","scripts/lib/staged-writer-control.mjs","workers/staged-save-runtime.ts","workers/staged-save.worker.ts","lib/resource-limits.ts","lib/staged-copy-protocol.ts"])r.sourcePins[file]=sha(await readFile(path.join(root,file)));
  const seed=Buffer.alloc(1048576);for(let i=0;i<seed.length;i++)seed[i]=i&255;const expected=createHash("sha256");for(let n=0;n<plan.bytes;n+=seed.length)expected.update(seed.subarray(0,Math.min(seed.length,plan.bytes-n)));r.expectedSha256=expected.digest("hex");
  runtime=await createOwnedRuntimeScratch("staged-writer-control-");r.runtime=runtime.directory;r.browser=await inspectInstalledChromePin();server=await startOwnedProductionTestServer({root,directory:runtime.directory,env:runtime.env,port:await port()});r.serverLaunch=server.launchRecord;
  const profile=path.join(runtime.directory,"profile");r.launch=["--headless=new","--remote-debugging-port=0",`--user-data-dir=${profile}`,"--no-first-run","--no-default-browser-check","about:blank"];
  chrome=spawn(r.browser.launcher.path,r.launch,{cwd:root,env:runtime.env,windowsHide:true,stdio:"ignore"});chrome.on("error",e=>r.failures.push(String(e)));identity=await queryReliableProcessIdentity(chrome.pid);assert.ok(identity);r.browserBirth=identity;
  monitor=await startChromiumMemoryMonitor(chrome.pid,runtime.directory,100);let debugPort;
  for(let n=0;n<45&&!debugPort;n++){try{debugPort=/^(\d+)\r?\n/.exec(await readFile(path.join(profile,"DevToolsActivePort"),"utf8"))?.[1];}catch(e){if(e.code!=="ENOENT")throw e;}if(!debugPort)await pause(250);}assert.ok(debugPort);
  browser=await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);const context=browser.contexts()[0];page=context.pages()[0];r.blank=await stable();
  const special=new Map([["/assets/within-test-stage-baseline.mjs",arms.arms.baseline.body],["/assets/within-test-stage-candidate.mjs",arms.arms.candidate.body],["/assets/within-test-stage-generator.mjs",generator]]),assets=new Set(special.keys());
  for(const dir of ["assets","engines"])for(const name of await readdir(path.join(root,"dist/client",dir),{recursive:true}))assets.add(`/${dir}/${name.replaceAll("\\","/")}`);for(const name of await readdir(path.join(root,"dist/client")))assets.add("/"+name);
  await context.addInitScript(`window.__WITHIN_AUDIO_VALIDATION_CHUNK__=(${encodeBoundedValidationChunk.toString()});`);
  await context.route("**/*",async route=>{const q=route.request();let frameUrl=null;try{frameUrl=q.frame()?.url()??null;}catch{}const kind=classifyPrivateRequest({method:q.method(),url:q.url(),postData:q.postData(),frameUrl,serviceWorkerUrl:q.serviceWorker?.()?.url()??null},server.baseURL);
    if(++r.requests>256||!(kind==="browser-local"||kind==="app-static"&&isCompatibilityStaticPath(q.url(),server.baseURL,assets))){r.forbiddenRequests.push({method:q.method(),urlSha256:sha(q.url())});await route.abort();}
    else if(special.has(new URL(q.url()).pathname))await route.fulfill({status:200,contentType:"text/javascript",body:special.get(new URL(q.url()).pathname),headers:{"cross-origin-resource-policy":"same-origin","cross-origin-embedder-policy":"require-corp","cross-origin-opener-policy":"same-origin","cache-control":"no-store"}});else await route.continue();});
  r.browserErrors=[];page.on("console",m=>{if(m.type()==="error"&&r.browserErrors.length<16)r.browserErrors.push(m.text().slice(0,2048));});
  await page.goto(server.baseURL);await page.getByTestId("file-input").waitFor();assert.equal(await page.evaluate(()=>crossOriginIsolated),true);r.loaded=await stable();controlStart=Date.now();
  for(const [index,arm]of plan.order.entries()){
    const jobId=`writer-${index+1}`,stage=`within-stage-mkv-to-mp4-${jobId}`,output=`within-test-staged-writer-${index+1}.data`;
    const c={arm,sourceBytes:plan.bytes,jobId};r.cases.push(c);
    try{
      c.generation=await page.evaluate(async({stage,bytes})=>{const estimate=await navigator.storage.estimate();if(estimate.quota-estimate.usage<bytes*2+67108864)throw Error("Insufficient OPFS quota");const root=await navigator.storage.getDirectory();if([...await (async()=>{const a=[];for await(const [n]of root.entries())a.push(n);return a;})()].length)throw Error("Expected empty owned profile storage");const w=new Worker("/assets/within-test-stage-generator.mjs",{type:"module"});try{return await new Promise((resolve,reject)=>{w.onerror=e=>reject(Error(e.message));w.onmessage=e=>e.data.type==="generated"?resolve(e.data):reject(Error(e.data.message));w.postMessage({name:stage,bytes});});}finally{w.terminate();}},{stage,bytes:plan.bytes});await drain();
      c.start=Date.now();
      c.result=await page.evaluate(async({arm,stage,output,bytes,jobId})=>{const root=await navigator.storage.getDirectory(),handle=await root.getFileHandle(output,{create:true}),signal=new SharedArrayBuffer(4),w=new Worker(`/assets/within-test-stage-${arm}.mjs`,{type:"module"});let started;
        window.__STAGED_WRITER_CONTROL__={cancel:()=>Atomics.store(new Int32Array(signal),0,1)};
        try{return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{Atomics.store(new Int32Array(signal),0,1);reject(Error("Staged writer control timeout"));},120000);w.onerror=e=>{clearTimeout(timer);reject(Error(e.message));};w.onmessage=e=>{const m=e.data;if(m.type==="ready"){started=performance.now();w.postMessage({type:"copy-staged",jobId,profileId:"mkv-to-mp4",stagingName:stage,handle,cancellationBuffer:signal,jobStartedEpochMs:performance.timeOrigin+started,metrics:{inputBytes:bytes,outputBytes:0,queuedBytes:0,peakQueuedBytes:0,pendingOperations:0,peakPendingOperations:0,maxReadChunkBytes:0,maxWriteChunkBytes:0,elapsedMs:0,wasmMemoryBytes:0,peakWasmMemoryBytes:0,sharedArrayBufferBytes:0,activeWorkerCount:1,scratchBytes:bytes,peakScratchBytes:bytes}});}else if(["complete","cancelled","error"].includes(m.type)){clearTimeout(timer);resolve({...m,wallElapsedMs:performance.now()-started});}};});}finally{w.terminate();window.__STAGED_WRITER_CONTROL__=null;}},{arm,stage,output,bytes:plan.bytes,jobId});c.end=Date.now();await drain();assert.equal(c.result.type,"complete",c.result.message);c.elapsedMs=c.result.wallElapsedMs;
      const binding=await bindLargeDocumentOutputValidationBacking(page,profile,output,plan.bytes);c.binding={...binding.proof,controlScope:"generic pattern-file saver only, not a document conversion"};const h=createHash("sha256");for await(const chunk of createReadStream(binding.file,{highWaterMark:1048576}))h.update(chunk);c.outputSha256=h.digest("hex");assert.equal(c.outputSha256,r.expectedSha256);await assertOpfsOutputValidationBackingUnchanged(binding);
      const m=c.result.metrics;assert.equal(m.outputBytes,plan.bytes);assert.equal(m.scratchBytes,0);assert.ok(m.maxScratchReadChunkBytes<=524288&&m.maxWriteChunkBytes<=524288&&m.peakQueuedBytes<=524288);assert.equal(m.peakPendingOperations,1);assert.equal(m.pendingOperations,0);
    }finally{await page.evaluate(async names=>{const root=await navigator.storage.getDirectory();for(const name of names)try{await root.removeEntry(name);}catch(e){if(e.name!=="NotFoundError")throw e;}},[stage,output]);c.ownedFilesRemoved=true;}
    c.cleanup=await stable();c.cleanupAboveLoadedMiB=(c.cleanup.privateBytes-r.loaded.privateBytes)/1048576;assert.ok(c.cleanupAboveLoadedMiB<=96);
  }
  r.controlEnd=Date.now();await drain();const valid=samples.filter(s=>Date.parse(s.timestamp)>=controlStart&&s.privateBytes!==null);r.memory={peakPrivateBytes:Math.max(...valid.map(s=>s.privateBytes)),incrementalPrivateMiB:(Math.max(...valid.map(s=>s.privateBytes))-r.blank.privateBytes)/1048576,validSamples:valid.length};assert.ok(r.memory.incrementalPrivateMiB<=250);
  r.timing=summarizeStagedWriterTiming(r.cases);assert.deepEqual(r.forbiddenRequests,[]);r.status=r.timing.matchedCopyTimingGatePassed?"passed-isolated-copy-screen-not-conversion-acceptance":"completed-no-meaningful-copy-speedup-candidate-not-accepted";
}catch(error){r.status="failed-not-acceptance";r.failures.push(String(error.stack??error));process.exitCode=1;}
finally{
  try{controlStart=null;await drain();if(identity){const observedPids=[...new Set([identity.pid,...samples.flatMap(s=>(s.processes??[]).map(p=>p.pid))])];r.browserCleanup=await cleanupOwnedChromium({identity,observedPids,disconnect:async()=>{await browser?.close();}});r.birthCleanup=reconcileChromiumBirths({identity,observedPids,samples,current:await queryObservedPidCensus(observedPids)});assert.equal(r.birthCleanup.allObservedBirthsAbsent,true);}}catch(e){r.failures.push("Browser cleanup: "+e);}
  try{await finishOwnedCleanup([async()=>monitor?.close(),async()=>server?.close()]);assert.ok(!identity||r.birthCleanup?.allObservedBirthsAbsent);await runtime?.close();r.ownedRuntimeRemoved=Boolean(runtime);for(const[file,h]of Object.entries(r.sourcePins))assert.equal(sha(await readFile(path.join(root,file))),h,file);}catch(e){r.failures.push("Owned cleanup/source: "+e);}
  if(r.failures.length){r.status="failed-not-acceptance";process.exitCode=1;}const raw=Buffer.from(JSON.stringify(samples)),packed=gzipSync(raw,{level:9});r.nativeArchive={file:base+"-native.json.gz",sha256:sha(packed),decodedSha256:sha(raw),samples:samples.length};await writeFile(path.join(root,r.nativeArchive.file),packed,{flag:"wx"});r.finishedAt=new Date().toISOString();await writeFile(path.join(root,base+".json"),JSON.stringify(r,null,2)+"\n",{flag:"wx"});console.log(JSON.stringify({file:base+".json",status:r.status,timing:r.timing,memory:r.memory,failures:r.failures}));
}
