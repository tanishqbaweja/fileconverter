// Force an unavailable global dump in a bounded synthetic worker control, not
// user conversion. Preserve original fixed storage/flags/trigger/cleanup.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeBudgetControlRetry } from "./native-budget-control-retry-recipe.mjs";
export function makePartialBlinkControl(source,root,resolvePackage){
  const prior=makeBudgetControlRetry(source,root,resolvePackage);
  const uri=name=>JSON.stringify(pathToFileURL(path.join(root,`scripts/lib/${name}.mjs`)).href);
  const patches=[
    [`import { makeDetailedBlinkAttribution } from ${uri("largest-blink-attribution-recipe")};`,
      `import { makePartialBlinkAttribution } from ${uri("partial-blink-attribution-recipe")};
const archivePath=${JSON.stringify(path.join(root,"outputs/reports/2026-10-08-partial-blink-blocked-control-partial-blink-trace.json.gz"))};`],
    ['generatedHelper = makeDetailedBlinkAttribution(await readFile(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs"), "utf8"), root);',
      'generatedHelper = makePartialBlinkAttribution(await readFile(path.join(root, "scripts/lib/bounded-renderer-attribution.mjs"), "utf8"), root,archivePath);'],
    ['allocationStartedAt = Date.now();',`await page.evaluate(async () => {
    const source='postMessage("ready");const end=Date.now()+35000;while(Date.now()<end){}';
    globalThis.__partialDumpWorker=new Worker("data:text/javascript,"+encodeURIComponent(source));
    await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error("Worker control readiness timeout")),5000);
      globalThis.__partialDumpWorker.onmessage=event=>{if(event.data!=="ready")return;clearTimeout(timer);resolve();};});
  });
  allocationStartedAt = Date.now();`],
    ['const deadline = Date.now() + 20000;', 'const deadline = Date.now() + 30000;'],
    ['assert.equal(capture.callback.result.success, true);','assert.equal(capture.callback.result.success, false,"Failed global dump must NOT become success");'],
    ['traceReport = await attribution.stop(); assert.equal(traceReport.status, "completed-diagnostic");',
      'traceReport = await attribution.stop(); assert.equal(traceReport.status, "failed-diagnostic");'],
    ['assert.equal(traceReport.sessions[0].trace.trace.dataLossOccurred, false);',`assert.equal(traceReport.sessions[0].trace.trace.dataLossOccurred, false);
  const trace=traceReport.sessions[0].trace;
  assert.equal(trace.dumps[0].memoryDump.success,false);
  assert.equal(trace.trace.parseError,null);assert.equal(trace.trace.overflow,false);
  assert.equal(trace.trace.rawRetained,true);assert.ok(trace.trace.rawArchive.bytes<=4194304);
  assert.equal(trace.allocatorSummary.length,1);assert.equal(trace.allocatorSummary[0].globalRequestSucceeded,false);
  assert.equal(trace.allocatorSummary[0].partialGlobalDump,true);
  assert.ok(trace.allocatorSummary[0].processes.some(p=>p.blinkTypeStatistics?.length>0));`],
    ['delete globalThis.__budgetFailureControl;', 'globalThis.__partialDumpWorker?.terminate();delete globalThis.__partialDumpWorker;delete globalThis.__budgetFailureControl;'],
    ['const files = ["scripts/retry-native-budget-failure.mjs",',
      'const files = ["scripts/probe-partial-blink-blocked.mjs", "scripts/lib/partial-blink-control-recipe.mjs", "scripts/lib/partial-blink-attribution-recipe.mjs", "scripts/lib/partial-memory-infra-attribution.mjs", "scripts/lib/partial-complete-blink-heap-summary.mjs", "scripts/lib/partial-largest-blink-type-summary.mjs", "scripts/retry-native-budget-failure.mjs",'],
    ['scope: "actual-single-post250MiB-native-failure-synthetic-blank-control-not-converter"',
      'scope: "actual-partial-global-dump-records-synthetic-blocked-worker-control-not-converter"'],
    ['? "failed-diagnostic" : "completed-diagnostic"','? "failed-partial-record-control" : "verified-partial-record-control-global-dump-failed"'],
    ['generatedHelper, generatedHelperSha256: generatedHelper && sha(generatedHelper),',
      'executedGeneratedSource:await readFile(import.meta.filename,"utf8"),executedGeneratedSourceSha256:sha(await readFile(import.meta.filename)),\n    generatedHelper, generatedHelperSha256: generatedHelper && sha(generatedHelper),'],
    ['evidence/native-budget-failure-control-retry-2026-10-07.json','evidence/partial-blink-blocked-control-2026-10-08.json'],
    ['"budget-failure-control-"','"partial-blink-blocked-control-"'],
    ['caveat: "264MiB touched SYNTHETIC diagnostic storage intentionally exceeds',
      'caveat: "Global dump intentionally fails with a35second blocked synthetic worker; available CLOSED-GUID records retained explicitly partial/not live/callsite/cause/acceptance. No user input/output/native conversion or full-original acceptance. 264MiB touched SYNTHETIC diagnostic storage intentionally exceeds'],
  ];
  let result=prior;
  for(const[before,after]of patches){assert.equal(result.split(before).length,2,before);result=result.replace(before,after);}
  let reversed=result;
  for(const[before,after]of [...patches].reverse()){assert.equal(reversed.split(after).length,2,after);reversed=reversed.replace(after,before);}
  assert.equal(reversed,prior,"Only controlled blocked worker/partial parser/raw retention/provenance; no acceptance weakening");
  return result;
}
