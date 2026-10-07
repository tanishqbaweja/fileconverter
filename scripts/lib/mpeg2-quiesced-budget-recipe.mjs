// Strict derivative of the actually executed staged full-original driver.
// Preserve every full-source acceptance gate; only post-failure measurement
// uses ordinary production cancellation/worker replacement before one dump.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeStagedAbortOriginalDriver } from "./mpeg2-staged-abort-original-recipe.mjs";
export function makeQuiescedBudgetDriver(source,root,resolvePackage,adapter,helper,traceHelperUrl){
  const prior=makeStagedAbortOriginalDriver(source,root,resolvePackage,adapter,helper);
  const uri=name=>JSON.stringify(pathToFileURL(path.join(root,`scripts/lib/${name}.mjs`)).href);
  const patches=[
    ['let completedReport, completedReportPath; export { completedReport, completedReportPath };',
      `import { startBoundedRendererAttribution } from ${JSON.stringify(traceHelperUrl)};
import { createIndependentBlinkSessions } from ${uri("independent-blink-sessions")};
let rendererAttribution=null,rendererAttributionResult=null;
const quiescedBudgetCapture={startedAt:null,workerClosedAt:null,oldWorkerCloseObserved:null,
  oldWorkerUrl:null,stateBefore:null,stateAfter:null,cancellation:null,noForcedGc:true,
  noTestWorkerTermination:true,allocationObjectOrCallsite:null,publicAcceptance:false};
let completedReport, completedReportPath; export { completedReport, completedReportPath };`],
    ['onFailure: async event => ({ dom: await domSampler.sample("native-budget-failure"),\n      nativeAcquiredAt: event.after.timestamp, causalAllocationClaim: null }),',
      `onFailure: async event => {
      quiescedBudgetCapture.startedAt=Date.now();
      quiescedBudgetCapture.stateBefore=await page.evaluate(()=>window.__WITHIN_TEST__?.getState()??null);
      const workers=page.workers().filter(w=>w.url().startsWith(origin+"/assets/conversion.worker-"));
      assert.ok(workers.length<=1,"Only actual production worker, no extra synthetic worker");
      const closed=workers.length?new Promise(resolve=>workers[0].once("close",resolve)):null;
      quiescedBudgetCapture.oldWorkerUrl=workers[0]?.url()??null;
      quiescedBudgetCapture.cancellation=await cancelBrowserConversionBeforeCleanup(page);
      if(closed){
        let timer;
        try{await Promise.race([closed,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error("Production replacement worker close deadline")),5000);})]);}
        finally{clearTimeout(timer);}
        quiescedBudgetCapture.oldWorkerCloseObserved=true;quiescedBudgetCapture.workerClosedAt=Date.now();
      }
      quiescedBudgetCapture.stateAfter=await page.evaluate(()=>window.__WITHIN_TEST__?.getState()??null);
      assert.ok(["cancelled","error","complete"].includes(quiescedBudgetCapture.stateAfter?.jobState));
      assert.equal(rendererAttribution,null,"One failure-only dump, none before actual budget failure");
      rendererAttribution=createIndependentBlinkSessions({createSession:()=>browser.newBrowserCDPSession(),startAttribution:startBoundedRendererAttribution,realms});
      return rendererAttribution.dump("post-production-cancel-budget-failure-"+event.after.sequence,event.after.processes);
    },`],
    ['if (observer) nativeFailureCapture = await observer.finishCapture();',
      'if (observer) nativeFailureCapture = await observer.finishCapture();\n    if(rendererAttribution)rendererAttributionResult=await rendererAttribution.stop();'],
    ['const sourceFiles = ["scripts/mpeg2-staged-abort-original-memory.mjs",',
      'const sourceFiles = ["scripts/mpeg2-quiesced-budget-memory.mjs", "scripts/lib/mpeg2-quiesced-budget-recipe.mjs", "scripts/lib/partial-blink-attribution-recipe.mjs", "scripts/lib/partial-memory-infra-attribution.mjs", "scripts/lib/partial-complete-blink-heap-summary.mjs", "scripts/lib/partial-largest-blink-type-summary.mjs", "scripts/lib/independent-blink-sessions.mjs", "scripts/lib/bounded-renderer-attribution.mjs", "scripts/lib/largest-blink-attribution-recipe.mjs", "scripts/lib/detailed-blink-attribution-recipe.mjs", "scripts/lib/complete-blink-heap-summary.mjs", "scripts/lib/memory-infra-attribution.mjs", "evidence/partial-blink-blocked-control-verification-2026-10-08.json", "evidence/partial-blink-quiesced-control-verification-2026-10-08.json", "evidence/mpeg2-staged-abort-terminal-analysis-2026-10-08.json", "scripts/mpeg2-staged-abort-original-memory.mjs",'],
    ['nativeMemory, nativeFailureCapture, domSamplerReport, cssCandidate, abortDiagnostic, failure,',
      'nativeMemory, nativeFailureCapture, domSamplerReport, cssCandidate, abortDiagnostic, quiescedBudgetCapture, rendererAttributionResult, failure,'],
    ['-private-mpeg2-staged-abort-original-native-100ms','-private-mpeg2-quiesced-budget-native-100ms'],
    ['"mpeg2-staged-abort-original-runtime-"','"mpeg2-quiesced-budget-runtime-"'],
    ['Full protected original with equivalent flex CSS and actually validated generated-adapter onAbort observers;',
      'Full protected original with equivalent flex CSS/proven staged abort observer; ONE post-budget-failure normal production cancellation/worker-close/detailed partial-capable dump with bounded raw archive, delayed NOT peak-time allocator proof;'],
  ];
  let result=prior;
  for(const[before,after]of patches){assert.equal(result.split(before).length,2,before);result=result.replace(before,after);}
  let reversed=result;
  for(const[before,after]of [...patches].reverse()){assert.equal(reversed.split(after).length,2,after);reversed=reversed.replace(after,before);}
  assert.equal(reversed,prior,"Only post-failure normal cancellation+measurement/provenance, no original gate/quality/heap/baseline change");return result;
}
