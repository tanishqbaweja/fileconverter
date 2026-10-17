import assert from "node:assert/strict";
import path from "node:path";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { gunzipSync } from "node:zlib";
import { deriveUpdatedChromeMedia } from "./updated-chrome-media.mjs";
import { exactPatch } from "./ebml-reuse-browser-components.mjs";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";

// Diagnostic derivation only: keep all per-output independent validators and
// the real production pipeline. This does not qualify a public route.
export function deriveRepeatStartupMedia(parent, root, directory, stamp, pin) {
  const result = deriveUpdatedChromeMedia(parent, root, directory, stamp, pin);
  const generated = result.generated;
  const fullArchive = readFileSync(path.join(root, "outputs/reports/2026-10-16T21-31-52-360Z-recorded-timeline-full-sources.json.gz"));
  assert.equal(sha(fullArchive), "c769222cc86f4dec691827f81e9232a087f843deeed9216832c714f1636f86f1");
  const fullDriver = JSON.parse(gunzipSync(fullArchive, { maxOutputLength: 8388608 })).driver;
  const css = JSON.parse(fullDriver.match(/const cssCandidate = \{ css: ("(?:\\.|[^"\\])*")/)[1]);
  assert.equal(sha(css), "37257965a98bdeede4bdcba5677e0f75f42431b7405530169fcfeb2ef106022a");
  const uri = file => pathToFileURL(path.join(root, "scripts/lib", file)).href;
  const injected = `
test("same-page startup diagnostic six validated repeats", async ({page,browser}) => {
  test.setTimeout(540000);
  const {startChromiumMemoryMonitor}=await import(${JSON.stringify(uri("persistent-chromium-memory.mjs"))});
  const {createNativeMemoryHistory}=await import(${JSON.stringify(uri("native-memory-history.mjs"))});
  const {stableWindow}=await import(${JSON.stringify(uri("chromium-private-memory.mjs"))});
  const {queryReliableProcessIdentity}=await import(${JSON.stringify(uri("reliable-owned-identity.mjs"))});
  const {observeOwnedProcessExit}=await import(${JSON.stringify(uri("owned-process-exit-observation.mjs"))});
  const cdp=await browser.newBrowserCDPSession();
  const info=await cdp.send("SystemInfo.getProcessInfo");await cdp.detach();
  const rootPid=info.processInfo.find(p=>p.type==="browser")!.id;
  const history=createNativeMemoryHistory(rootPid);
  let observer,draining=true,task,monitorIdentity,baseline;
  const startupEvents: Array<Record<string,unknown>>=[];
  page.on("console",message=>{
    const text=message.text(),prefix="WITHIN_STARTUP_WASM ";
    if(text.startsWith(prefix)){expect(text.length).toBeLessThan(512);expect(startupEvents.length).toBeLessThan(128);
      startupEvents.push(JSON.parse(text.slice(prefix.length)));}
  });
  try {
    observer=await startChromiumMemoryMonitor(rootPid,candidate);
    monitorIdentity=await queryReliableProcessIdentity(observer.pid);
    expect(monitorIdentity?.parentPid).toBe(process.pid);
    task=(async()=>{while(draining){await new Promise(r=>setTimeout(r,1000));history.consume(await observer!.drain());}})();
    // Attach a rejection handler now; errors are rethrown by the awaited task.
    void task.catch(()=>{});
    history.setPhase("blank");
    const baselineSamples: Array<ProcessSample & {elapsedMs:number}>=[],begin=Date.now();
    while(Date.now()-begin<60000){
      const sample=await sampleTree(rootPid,"blank");baselineSamples.push({...sample,elapsedMs:Date.now()-begin});
      baseline=stableWindow(baselineSamples);
      if(baseline)break;
      await new Promise(r=>setTimeout(r,2000));
    }
    expect(baseline?.stable,"Stable same-instance blank baseline required").toBe(true);
    rows.push({kind:"repeat-startup-blank-baseline",baseline,samples:baselineSamples});
    history.setPhase("loaded-idle");
    await page.route("**/assets/index-CxGQ2N3s.css",async route=>{
      const response=await route.fetch(),original=await response.text();
      expect(createHash("sha256").update(original).digest("hex")).toBe("3c4c62c528d98b5bd03492134f40bdca249e9c2896a5b607a63ca29ae46c34a6");
      const body=original+${JSON.stringify(css)};
      expect(createHash("sha256").update(body).digest("hex")).toBe("81862974af7b02ede01b5122b4a8bc372600fb6f528bd11fabee2687ea78e311");
      rows.push({kind:"repeat-startup-matched-full-stylesheet",bytes:Buffer.byteLength(body),
        sha256:createHash("sha256").update(body).digest("hex"),viewport:page.viewportSize()});
      await route.fulfill({response,body});
    });
    await page.goto("/?test=1&directory=1");
    await page.waitForFunction(()=>window.__WITHIN_TEST__?.getState().workerStatus==="ready");
    rows.push({kind:"repeat-startup-loaded-idle",sample:await sampleTree(rootPid,"loaded-idle")});
    const adapter=adapters.find(a=>a.fixture==="hevc"&&a.destination==="direct")!;
    for(let iteration=1;iteration<=6;iteration++){
      await page.waitForFunction(()=>window.__WITHIN_TEST__?.getState().workerStatus==="ready");
      expect(page.workers()).toHaveLength(1);
      const worker=page.workers()[0];
      await worker.evaluate(()=>{
        // Record only bounded API/timing scalars, never arguments/media bytes.
        for(const method of ["instantiate","instantiateStreaming","compile","compileStreaming"] as const){
          const original=WebAssembly[method];if(typeof original!=="function")continue;
          Object.defineProperty(WebAssembly,method,{configurable:true,writable:true,value:async function(...args: unknown[]){
            const record=(event:string)=>console.debug("WITHIN_STARTUP_WASM "+JSON.stringify({method,event,epochMs:performance.timeOrigin+performance.now()}));
            record("begin");try{const value=await Reflect.apply(original,WebAssembly,args);record("end");return value;}
            catch(error){record("error");throw error;}
          }});
        }
      });
      stackReserveSamples.length=0;splitFinalSamples.length=0;asyncifyStorageSamples.length=0;
      bitrateAuditSamples.length=0;inputReadFailureSamples.length=0;
      history.setPhase("job-"+iteration);
      const startRow=rows.length,startedAt=Date.now(),startupStart=startupEvents.length;
      try{await validateConversion(page,adapter,false);}
      finally{await new Promise(r=>setTimeout(r,1100));rows.push({kind:"repeat-startup-job",iteration,startRow,startedAt,finishedAt:Date.now(),
        startupEvents:startupEvents.slice(startupStart),nativePeak:history.peaks(["job-"+iteration]),
        includesIndependentValidation:true,noPageReload:true,forcedGc:false,publicAcceptance:false});}
      const peak=history.peaks(["job-"+iteration]);
      expect(peak.validSamples).toBeGreaterThan(0);
      // Missing native readings stay null and are excluded, not invented as 0.
      // This short diagnostic never claims uninterrupted full-file coverage.
      expect((peak.peak!.privateBytes!-baseline!.privateBytes)/1024**2,"Unchanged complete-tree 250MiB limit").toBeLessThanOrEqual(250);
      history.setPhase("recovery-"+iteration);
      await page.waitForFunction(()=>window.__WITHIN_TEST__?.getState().workerStatus==="ready");
      await new Promise(r=>setTimeout(r,3000));
      rows.push({kind:"repeat-startup-recovery",iteration,sample:await sampleTree(rootPid,"recovery-"+iteration),
        startupEventsRetained:startupEvents.length});
    }
  }finally{
    draining=false;
    try{if(task)await task;}
    finally{
      try{await observer?.close();}
      finally{
        const absence=monitorIdentity?await observeOwnedProcessExit(monitorIdentity):null;
        rows.push({kind:"repeat-startup-native-history",baseline:baseline??null,history:history.report(),monitorIdentity:monitorIdentity??null,
          observerAbsence:absence,allocationCause:null,publicAcceptance:false,
          scope:"Six small same-page real conversions, startup timing instrumentation; NOT original-file acceptance or speed benchmark"});
        if(monitorIdentity)expect(absence?.status).toBe("owned-identity-absent");
      }
    }
  }
});
`;
  generated.spec = exactPatch(generated.spec, [
    ['expect(events.length).toBeLessThan(32)', 'expect(events.length).toBeLessThan(64)'],
  ]).generated + injected;
  generated.config = generated.config.replace(/grep:\/private split MPEG2 .*?\//,
    'grep:/same-page startup diagnostic six validated repeats/');
  assert.ok(generated.config.includes('grep:/same-page startup diagnostic six validated repeats/'));
  generated.config = exactPatch(generated.config, [['"globalTimeout":270000', '"globalTimeout":570000']]).generated;
  generated.config = exactPatch(generated.config, [['"use":{', '"use":{"viewport":{"width":1280,"height":900},']]).generated;
  generated.config = exactPatch(generated.config, [['"trace":"retain-on-failure"',
    '"trace":{"mode":"retain-on-failure","screenshots":false,"snapshots":false,"sources":false}']]).generated;
  generated.driver = exactPatch(generated.driver, [['300_000', '600_000'],
    ['  // Stop helper trees before restoring files/removing their owned scratch.',
      `  // Preserve only the bounded owned trace before removing disposable data.
  try {
    const {readFile,stat}=await import("node:fs/promises");
    const trace=path.join(${JSON.stringify(directory)},"artifacts/candidate-same-page-startup-diagnostic-six-validated-repeats/trace.zip");
    let row;try{row=await stat(trace);}catch(error){if(error.code!=="ENOENT")throw error;}
    if(row){assert.ok(row.isFile()&&row.size<=8388608);await writeFile(path.join(root,${JSON.stringify(`outputs/reports/${stamp}-repeat-startup-trace.zip`)}),await readFile(trace),{flag:"wx"});}
  }catch(error){process.stderr.write(String(error)+"\\n");process.exitCode=1;}
  // Stop helper trees before restoring files/removing their owned scratch.`],
  ]).generated;
  return { ...result, generated, onlyBrowserIdentityAndOwnedPathsChanged: false,
    conversionAndValidationGatesChanged: false, diagnosticHarnessChanged: true,
    repeats: 6, noPageReloadBetweenRepeats: true, startupTimingInstrumentation: true,
    completeChromiumMemoryAcceptance: false, fullOriginalAcceptance: false, publicAcceptance: false };
}

export function deriveRepeatStartupRunner(source, root) {
  // Preserve the qualified runner's source replay, build/restore, original SHA,
  // process-birth guards and finally cleanup. Only diagnostic orchestration and
  // result interpretation change. All changes are retained in the source archive.
  const uri = file => pathToFileURL(path.join(root, "scripts", file)).href;
  let next = source.replace(/from "(\.[^"\r\n]+)"/g, (_, file) => `from ${JSON.stringify(uri(file))}`)
    .replace('import "./lib/reliable-readonly-preflight.mjs";', `import ${JSON.stringify(uri("./lib/reliable-readonly-preflight.mjs"))};`);
  const begin = next.indexOf('    const baseline=JSON.parse(await read(parent.baseline.path))');
  const end = next.indexOf('    const compressed=gzipSync(raw,{level:9})', begin);
  assert.ok(begin > 0 && end > begin);
  const analysis = `    const jobs=report.rows.filter(row=>row.kind==="repeat-startup-job");
    const validated=report.rows.filter(row=>row.status==="passed"&&row.container==="mp4"&&row.sourceCodec==="hevc"&&row.destination==="direct").length;
    if(!receipt.driverFailure){assert.equal(jobs.length,6);assert.equal(validated,6);}
    const historyRow=report.rows.find(row=>row.kind==="repeat-startup-native-history");
    assert.equal(historyRow.observerAbsence.status,"owned-identity-absent");
    receipt.analysis={completedValidatedSmallRuns:validated,attemptedSmallRuns:jobs.length,noPageReloadBetweenRepeats:true,
      allocationCause:null,fullOriginalAcceptance:false,publicAcceptance:false};
    if(receipt.driverFailure)receipt.failure=receipt.driverFailure;
    const buildPath=\`evidence/\${stamp}-composited-handoff-build.json\`;
    receipt.build={path:buildPath,sha256:sha(await read(buildPath))};
`;
  next = exactPatch(next, [[next.slice(begin, end), analysis],
    ['    receipt.actualRuntimeVersions=versions;receipt.allFourPacketProofsEqualPreviousBrowser=true;',
      '    receipt.actualRuntimeVersions=report.rows.filter(row=>row.kind==="actual-runtime-browser-version");'],
    [`import {deriveUpdatedChromeMedia} from ${JSON.stringify(uri("./lib/updated-chrome-media.mjs"))};`,
      `import {deriveRepeatStartupMedia as deriveUpdatedChromeMedia} from ${JSON.stringify(uri("./lib/repeat-startup-diagnostic.mjs"))};`],
    ['const root=path.resolve(import.meta.dirname,".."),', `const root=${JSON.stringify(root)},`],
    ['const newFiles=["scripts/qualify-updated-chrome-media.mjs","scripts/lib/updated-chrome-media.mjs","tests/updated-chrome-media.test.mjs"];',
      'const newFiles=["scripts/qualify-updated-chrome-media.mjs","scripts/lib/updated-chrome-media.mjs","tests/updated-chrome-media.test.mjs","scripts/diagnose-repeat-startup.mjs","scripts/lib/repeat-startup-diagnostic.mjs","tests/repeat-startup-diagnostic.test.mjs"];'],
    ['receipt.derivative={changes:recipe.changes,onlyBrowserIdentityAndOwnedPathsChanged:true,conversionAndValidationGatesChanged:false};',
      'receipt.derivative={changes:recipe.changes,onlyBrowserIdentityAndOwnedPathsChanged:false,conversionAndValidationGatesChanged:false,diagnosticHarnessChanged:true,repeats:6};'],
    ['}finally{driverExited=true;}',
      '}catch(error){receipt.driverFailure={name:error.name,message:String(error.message).slice(0,8192),stdoutTail:typeof error.stdout==="string"?error.stdout.slice(-8192):null,stderrTail:typeof error.stderr==="string"?error.stderr.slice(-8192):null};process.exitCode=1;}finally{driverExited=true;}'],
  ]).generated;
  // Separate all actual diagnostic receipts and archives from prior evidence.
  return next.replaceAll('${stamp}-updated-chrome-media', '${stamp}-repeat-startup-diagnostic')
    .replace('four-updated-chrome-conversions-and-recovery-passed-not-full-acceptance',
      'six-small-same-page-diagnostic-conversions-passed-not-full-acceptance');
}
