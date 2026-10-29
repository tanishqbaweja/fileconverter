// Additional original6M lifecycle coverage, never a retry just for a green baseline.
import assert from "node:assert/strict";
import { makePremultipliedSvgQualification } from "./svg-premultiplied-qualification.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace=(source,before,after)=>{assert.equal(source.split(before).length-1,1,"Exact strip lifecycle anchor: "+before);return source.replace(before,after);};
export function makeSvgStripLifecycleQualification(options){
  assert.equal(options.workerPin.centralRows,128);
  const recovery=options.lifecycleRecoveryBytes.toString();assert.ok(Buffer.byteLength(recovery)<16384);
  const base=makePremultipliedSvgQualification(options),edits=[];
  let suite=base.suite;
  const edit=(before,after)=>{suite=replace(suite,before,after);edits.push([before,after]);};
  edit('    let stressPixelComparisonMs: number | null = null;',
    '    let stressPixelComparisonMs: number | null = null;\n    let executionRecovery: unknown = null;');
  edit('await page.goto(stressRepeat ? "/?test=1&directory=1" : "/?test=1");',
    'await page.goto(stressRepeat ? "/?test=1&directory=1" + (stressRepeat === "6m-effects-repeat-3" ? "&fault=write" : "") : "/?test=1");');
  const begin=suite.indexOf("for (const [\n  profileId,\n  sourceName,"),end=suite.indexOf('\n\ntest("GIF to JPEG XL preserves every frame',begin);
  assert.ok(begin>0&&end>begin);
  const body=suite.slice(begin,end),click='      await page.locator(\'[data-testid="convert-button"]\').click();';
  edit(body,replace(body,click,recovery+click));
  edit('const scalar = JSON.stringify({ repeat: stressRepeat, stripValidation, destinationMode: "direct-handle-test-directory",',
    'const scalar = JSON.stringify({ repeat: stressRepeat, stripValidation, executionRecovery, destinationMode: "direct-handle-test-directory",');
  edit('        expect(state!.metrics.svgMemoryObservation!.peakBytes).toBeGreaterThan(0);',
    '        expect(state!.metrics.svgMemoryObservation!.peakBytes).toBeGreaterThan(0);\n'+
    '        expect(state!.metrics.imageWorkingBytes).toBe(0);\n'+
    '        expect(state!.metrics.peakImageWorkingBytes).toBeGreaterThan(0);\n'+
    '        expect(state!.metrics.peakImageWorkingBytes).toBe(state!.metrics.svgStripPilot.peakExplicitBufferBytes);\n'+
    '        expect(state!.metrics.peakImageWorkingBytes).toBeLessThanOrEqual(2688000 + 3*262144 + 65524 + 65536 + 13);\n'+
    '        expect(state!.metrics.svgStripPilot).toMatchObject({ currentExplicitBufferBytes:0, explicitBufferScope:"owned-or-in-flight-JS-payload-excludes-Wasm-opaque-codec-GC-and-process-memory", png:{currentExplicitBufferBytes:0} });');
  let driver=replace(base.driver,JSON.stringify(sha(base.suite)),JSON.stringify(sha(suite)));
  driver=replace(driver,'  report.forbiddenRequests = forbidden; report.forbiddenRequestOverflow = forbiddenOverflow;',
    '  report.lifecycleRecovery = [];\n'+
    '  for (const index of [2,3]) { const repeat="6m-effects-repeat-"+index;\n'+
    '    try { const bytes=await readFile(path.join(runtime.directory,repeat+"-lifecycle.json")); assert.ok(bytes.length<=65536); report.lifecycleRecovery.push({repeat,result:JSON.parse(bytes),unavailable:null}); }\n'+
    '    catch(error){if(error.code!=="ENOENT")throw error;report.lifecycleRecovery.push({repeat,result:null,unavailable:"Not written before failure"});}\n'+
    '  }\n  report.forbiddenRequests = forbidden; report.forbiddenRequestOverflow = forbiddenOverflow;');
  driver=replace(driver,'report.sourcePremultipliedTransferCandidate = true;',
    'report.sourcePremultipliedTransferCandidate = true;\nreport.stripLifecycleDiagnostic = true;');
  driver=replace(driver,'"scripts/lib/svg-premultiplied-qualification.mjs",',
    '"scripts/lib/svg-premultiplied-qualification.mjs", "scripts/lib/svg-strip-lifecycle-qualification.mjs", "scripts/lib/svg-strip-lifecycle-recovery.txt",');
  return {...base,suite,driver,lifecycleSuiteEdits:edits,proof:{...base.proof,suiteSha256:sha(suite),driverSha256:sha(driver),
    stripLifecycleDiagnostic:true,lifecycleRecoverySha256:sha(options.lifecycleRecoveryBytes),
    original6MInputReferenceQualityAndAll31BandsRetained:true,original96MiB250MiBAndTimeoutsRetained:true,
    telemetryIsExplicitJsPayloadNotProcessMemory:true,publicPromotion:false}};
}
