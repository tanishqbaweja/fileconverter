import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { sha } from "./stable-ui-headless-baseline-recipe.mjs";
export const SPLIT_PROGRESS_OUTPUT_BYTES=67108864;
export const SPLIT_PROGRESS_MAXIMUM_MS=300000;
function patch(source,patches){
  let changed=source;
  for(const [before,after] of patches){assert.equal(changed.split(before).length,2,before);changed=changed.replace(before,after);}
  let original=changed;for(const [before,after] of patches.toReversed())original=original.replace(after,before);
  assert.equal(original,source,"Original full source/codec/fidelity/all-process budget/baseline/cleanup gates preserved");return changed;
}
export function makeSplitRenderProgressDriver(source,root,helperUri,binding,mode){
  assert.equal(sha(source),"497e36673ec4cfe92918e3fc47c0cf230d01fb250e7d0fdb14ca496fc50969c9");
  assert.ok(["baseline","candidate"].includes(mode));assert.match(binding.url,/^\/assets\/ConverterApp-[\w-]+\.js$/);
  assert.ok(binding.bytes>0&&binding.bytes<1048576);assert.match(binding.sha256,/^[a-f0-9]{64}$/);
  const oldProbe=source.match(/^const progressProbe = (.*);$/m);assert.ok(oldProbe);
  const progressProbe={...JSON.parse(oldProbe[1]),mode,checkpointOutputBytes:SPLIT_PROGRESS_OUTPUT_BYTES,maximumConversionMs:SPLIT_PROGRESS_MAXIMUM_MS,
    expectedAsset:binding,profilerClosed:null,jsAllocationSamplingEnabled:false,workCheckpoints:[],lastProgressObservation:null,
    unavailableProgressSamples:0,actualServedAsset:null,completeChromiumMemoryAcceptance:false};
  const helperImport=source.match(/^import \{ startBoundedRendererAttribution \} from (.*);$/m);assert.ok(helperImport);
  const scope=source.match(/^    scope: (".*"),$/m);assert.ok(scope);
  const patches=[
    ['const root = "H:\\\\Github Repositories\\\\fileconverter", MiB',`const root = ${JSON.stringify(root)}, MiB`],
    [oldProbe[0],`const progressProbe = ${JSON.stringify(progressProbe)};`],
    [helperImport[0],`import { startBoundedRendererAttribution } from ${JSON.stringify(helperUri)};`],
    ['import { createConversionJsAllocation } from "file:///H:/Github%20Repositories/fileconverter/scripts/lib/conversion-js-allocation-duration-bound.mjs";',
      `import { recordOutputWorkCheckpoint } from ${JSON.stringify(pathToFileURL(path.join(root,"scripts/lib/output-work-checkpoints.mjs")).href)};`],
    ['const sourceFiles = [','const sourceFiles = ["scripts/diagnose-split-render-progress.mjs","scripts/lib/split-render-progress-recipe.mjs","scripts/lib/output-work-checkpoints.mjs","tests/split-render-progress.test.mjs","scripts/build-split-render-ui-candidate.mjs","scripts/lib/split-render-ui-recipe.mjs",'],
    ['-private-mpeg2-ui-progress-baseline-native-100ms',`-private-mpeg2-split-render-${mode}-native-100ms`],
    ['"mpeg2-ui-progress-baseline-runtime-"',`"mpeg2-split-render-${mode}-runtime-"`],
    ['  conversionJs=await createConversionJsAllocation(domSession,{directory:reports,prefix:path.basename(reportBase),context,origin});',
      `  const actualAssetPromise=page.waitForResponse(response=>new URL(response.url()).pathname===progressProbe.expectedAsset.url);
  void actualAssetPromise.catch(()=>{});`],
    ['  observer.setPhase("loaded-navigation"); await page.goto(query);',
      `  observer.setPhase("loaded-navigation"); await page.goto(query);
  const actualAssetResponse=await actualAssetPromise;assert.equal(actualAssetResponse.ok(),true);
  const actualAssetBytes=await actualAssetResponse.body();assert.equal(actualAssetBytes.length,progressProbe.expectedAsset.bytes);
  assert.equal(createHash("sha256").update(actualAssetBytes).digest("hex"),progressProbe.expectedAsset.sha256);
  progressProbe.actualServedAsset={...progressProbe.expectedAsset};`],
    ['    if(number===1)await conversionJs.beforeConversion({jobState:lastState?.jobState??null,metrics:lastState?.metrics??null});',
      '    // No JS allocation sampling before/during conversion; original native/realm measurements remain.'],
    ['      if(number===1)await conversionJs.progress({jobState:lastState?.jobState??null,metrics:lastState?.metrics??null});',
      '      if(number===1)recordOutputWorkCheckpoint(progressProbe,lastState);'],
    ['        await conversionJs.close(); progressProbe.profilerClosed = true;',
      '        assert.equal(conversionJs,null,"No hidden allocation profiler");'],
    [scope[0],'    scope: "Matched headless split-render UI diagnostic, no JS allocation sampling during conversion. FULL unchanged original/codec/defaults/fixed32+16MiB/ALL-process250MiB/same lower five-minute blank;64MiB real-output checkpoint or300s deadline, normal cancellation still FAILS full completion/repeat/fidelity acceptance. Bounded equal-output timing brackets are not exact crossing or validated full-conversion speed. Same private CSS/native/realm monitoring; any native-budget failure retains original post-cancel detailed capture, NOT peak-time attribution.",'],
  ];
  const generated=patch(source,patches).replaceAll("file:///H:/Github%20Repositories/fileconverter/scripts/",pathToFileURL(path.join(root,"scripts")+path.sep).href);
  assert.ok(generated.includes('"--headless=new"')&&generated.includes('assert.equal(run.state.jobState, "complete"'));
  assert.ok(!generated.includes("await createConversionJsAllocation")&&!generated.includes("await conversionJs.progress("));
  return {generated,patches,baselineDriverSha256:sha(source),expectedAsset:binding,mode};
}
export function makeSplitRenderProgressTraceHelper(source,file){
  assert.equal(sha(source),"1dc7d48d4fb9d281f09ad96fc584a1eb13ed4c892af368321c88dccc1e17de61");
  const old=source.match(/^const rawArchivePath=.*;$/m);assert.ok(old);
  return patch(source,[[old[0],`const rawArchivePath=${JSON.stringify(file)};`]]);
}
