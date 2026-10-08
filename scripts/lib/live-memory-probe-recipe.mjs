import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export function makeLiveMemoryProbe(executed, root, stamp) {
  assert.equal(sha(executed), "497e36673ec4cfe92918e3fc47c0cf230d01fb250e7d0fdb14ca496fc50969c9");
  assert.match(stamp, /^[0-9TZ-]{20,40}$/);
  const uri = name => JSON.stringify(pathToFileURL(path.join(root, `scripts/lib/${name}.mjs`)).href);
  const callbackStart = executed.indexOf('    onFailure: async event => {');
  const callbackEnd = executed.indexOf('\n    },\n  });', callbackStart) + '\n    },'.length;
  assert.ok(callbackStart > 0 && callbackEnd > callbackStart);
  const oldCallback = executed.slice(callbackStart, callbackEnd);
  const capture = `
import { captureLiveMemoryInfra } from ${uri("live-memory-infra")};
const liveMemoryRecords=[]; let liveMemoryPending=null, liveMemoryMidpoint=false;
async function captureLive(phase,processes=null){
  if(liveMemoryPending)await liveMemoryPending;
  assert.ok(liveMemoryRecords.length<3,"Three live dump cap; no queued trace history");
  const row={phase,before:null,after:null,result:null,error:null};liveMemoryRecords.push(row);
  const operation=(async()=>{
    try{
      row.before=await page.evaluate(()=>window.__WITHIN_TEST__?.getState()??null);
      assert.equal(row.before?.jobState,phase==="before-conversion"?"idle":"running","Never label a cancelled or closed worker as a live conversion dump");
      processes??=(await sampleChromiumTree(chrome.pid)).processes;
      row.result=await captureLiveMemoryInfra({session:await browser.newBrowserCDPSession(),phase,processes,
        archivePath:path.join(reports,${JSON.stringify(stamp)}+"-live-memory-"+phase+".json.gz")});
      row.after=await page.evaluate(()=>window.__WITHIN_TEST__?.getState()??null);
    }catch(error){row.error=String(error).slice(0,1024);throw error;}
  })();liveMemoryPending=operation;
  try{await operation;return row.result;}finally{liveMemoryPending=null;}
}
`;
  const patches = [
    [executed.match(/import \{ startBoundedRendererAttribution \} from "[^"\n]+";/)[0],
      `import { startBoundedRendererAttribution } from ${uri("bounded-renderer-attribution")};`],
    ['let conversionJs=null,conversionJsReport=null;', 'let conversionJs=null,conversionJsReport=null;'+capture],
    [oldCallback, `    onFailure: async event => {
      let result;
      try{result=await captureLive("native-budget-"+event.after.sequence,event.after.processes);}
      finally{quiescedBudgetCapture.cancellation=await cancelBrowserConversionBeforeCleanup(page);}
      return result;
    },`],
    ['"checkpointOutputBytes":16777216', '"checkpointOutputBytes":67108864'],
    ['-private-mpeg2-ui-progress-baseline-native-100ms', '-private-mpeg2-live-memory-native-100ms'],
    ['"mpeg2-ui-progress-baseline-runtime-"', '"mpeg2-live-memory-runtime-"'],
    ['const sourceFiles = [', 'const sourceFiles = ["scripts/diagnose-live-memory.mjs","scripts/lib/live-memory-infra.mjs","scripts/lib/live-memory-probe-recipe.mjs","tests/live-memory-infra.test.mjs","tests/live-memory-probe.test.mjs",'],
    ['    progressProbe.performanceBefore = await domSession.send("Performance.getMetrics");',
      '    progressProbe.performanceBefore = await domSession.send("Performance.getMetrics");\n    await captureLive("before-conversion",first.processes);'],
    ['      // Stop a proven failed profile promptly;', `      if(!liveMemoryMidpoint&&lastState?.jobState==="running"&&(lastState.metrics?.outputBytes??0)>=8388608){
        liveMemoryMidpoint=true;await captureLive("running-output-8388608",sample.processes);
      }
      // Stop a proven failed profile promptly;`],
    ['        progressProbe.beforeCancellation = lastState;',
      '        progressProbe.beforeCancellation = lastState;\n        await captureLive("running-checkpoint",sample.processes);'],
    ['conversionJsReport, progressProbe, failure, logs,', 'conversionJsReport, progressProbe, liveMemoryRecords, failure, logs,'],
  ];
  let generated=executed;
  for(const [before,after]of patches){assert.equal(generated.split(before).length,2,before);generated=generated.replace(before,after);}
  let restored=generated;for(const [before,after]of patches.toReversed())restored=restored.replace(after,before);
  assert.equal(restored,executed,"Only declared live diagnostic callbacks/checkpoint; full-source, codec, quality, 250MiB/full completion/five-minute lower blank/finally unchanged");
  assert.ok(generated.includes('"--headless=new"')&&generated.includes("windowsHide: true"));
  return generated;
}
