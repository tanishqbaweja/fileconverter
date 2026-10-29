// New native bytes only. Original fixtures, production IO and acceptance limits remain unchanged.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeFilterLivenessSvgQualification } from "./svg-filter-liveness-qualification.mjs";
import { makeSvgSmallFidelityControl } from "./svg-small-fidelity-control.mjs";
import { makeSvgComponentFidelityControl } from "./svg-component-fidelity-control.mjs";
import { filterRegionPatch } from "../../images/resvg-source/filter-region-patch.mjs";
import { renderContextPatch } from "../../images/resvg-source/render-context-patch.mjs";
import { filterLivenessPatch } from "../../images/resvg-source/filter-liveness-patch.mjs";
import { filterPrecisionPatch } from "../../images/resvg-source/filter-precision-patch.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact precision browser qualifier anchor: "+before.slice(0,100));return source.split(before).join(after);};
export function assertSvgPrecisionSourceReceipt(receipt,pins){
  for(const [name,expected,pinName]of [
    ["filterRegionPatch",filterRegionPatch,"filterModulePatchedSha256"],
    ["renderContextPatch",renderContextPatch,"renderContextPatchedSha256"],
    ["filterLivenessPatch",filterLivenessPatch,"filterLivenessPatchedSha256"],
    ["filterPrecisionPatch",filterPrecisionPatch,"filterPrecisionPatchedSha256"]]){
    assert.equal(receipt[name]?.patchedSha256,expected.patchedSha256,name);
    assert.equal(pins[pinName],expected.patchedSha256,pinName);
  }
  assert.equal(receipt.sourceFinalMergePrecisionChanged,true);
  assert.equal(receipt.filterPrecisionPatch.kernelSha256,filterPrecisionPatch.kernelSha256);
  assert.equal(pins.filterPrecisionKernelSha256,filterPrecisionPatch.kernelSha256);
  assert.equal(receipt.filterPrecisionPatch.maximumFloatAccumulatorBytes,16777216);
  assert.equal(receipt.filterPrecisionPatch.fixtureOrFilterParametersChanged,false);
  assert.equal(receipt.filterPrecisionPatch.previousPrimitiveKernelsChanged,false);
  assert.equal(pins.experimentalMaximumBytes,100663296);
  assert.equal(pins.sourceRepeatPin,"images/resvg-source/filter-precision-raw-input.json");
}
function bindPrecisionCandidate(base,options){
  const suite=replace(base.suite,"images/resvg-source/filter-liveness-processed-input.json","images/resvg-source/filter-precision-processed-input.json");
  let driver=replace(base.driver,JSON.stringify(sha(base.suite)),JSON.stringify(sha(suite)));
  driver=replace(driver,"images/resvg-source/filter-liveness-processed-input.json","images/resvg-source/filter-precision-processed-input.json",2);
  driver=replace(driver,"images/resvg-source/filter-liveness-raw-input.json","images/resvg-source/filter-precision-raw-input.json",2);
  driver=replace(driver,"two-pinned-liveness-source-postprocessing-passes-byte-identical-not-browser-acceptance","two-pinned-precision-source-postprocessing-passes-byte-identical-not-browser-acceptance");
  driver=replace(driver,'  assert.equal(receipt.sourceIntermediateLifetimesChanged, true);',
    '  assert.equal(receipt.sourceIntermediateLifetimesChanged, true);\n  assertSvgPrecisionSourceReceipt(receipt,pins);');
  driver=replace(driver,'"scripts/lib/svg-filter-liveness-qualification.mjs"',
    '"scripts/lib/svg-filter-liveness-qualification.mjs", "scripts/lib/svg-filter-precision-qualification.mjs", "images/resvg-source/filter-precision-patch.mjs", "images/resvg-source/filter-precision-kernel.rs"');
  driver=replace(driver,'report.sourceFilterLivenessCandidate = true;',
    'report.sourceFilterLivenessCandidate = true;\nreport.sourceFilterPrecisionCandidate = true;');
  driver=`import {assertSvgPrecisionSourceReceipt} from ${JSON.stringify(pathToFileURL(path.join(options.root,"scripts/lib/svg-filter-precision-qualification.mjs")).href)};\n`+driver;
  return {...base,suite,driver,proof:{...base.proof,suiteSha256:sha(suite),driverSha256:sha(driver),
    sourceFilterPrecisionCandidate:true,filterPrecisionPatch,allFourSourcePatchProofsRequired:true,
    originalInputAndAllExistingAcceptanceAssertionsRetained:true,publicPromotion:false}};
}
export function makeFilterPrecisionSvgQualification(options){return bindPrecisionCandidate(makeFilterLivenessSvgQualification(options),options);}
export function makeSvgSmallPrecisionFidelityControl(options){return bindPrecisionCandidate(makeSvgSmallFidelityControl(options),options);}
export function makeSvgPrecisionIntegrationControl(options){assert.equal(options.integrationDiagnostics,true);return bindPrecisionCandidate(makeSvgComponentFidelityControl(options),options);}
