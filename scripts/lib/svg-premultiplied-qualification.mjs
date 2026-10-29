// New premultiplied native candidate only; no fixture, IO, timing, quality or memory exemptions.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeFilterLivenessSvgQualification } from "./svg-filter-liveness-qualification.mjs";
import { makeSvgSmallFidelityControl } from "./svg-small-fidelity-control.mjs";
import { filterRegionPatch } from "../../images/resvg-source/filter-region-patch.mjs";
import { renderContextPatch } from "../../images/resvg-source/render-context-patch.mjs";
import { filterLivenessPatch } from "../../images/resvg-source/filter-liveness-patch.mjs";
import { premultipliedTransferPatch } from "../../images/resvg-source/premultiplied-transfer-patch.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact premultiplied browser qualifier anchor");return source.split(before).join(after);};
export function assertSvgPremultipliedSourceReceipt(receipt,pins){
  for(const [name,expected,pinName]of [
    ["filterRegionPatch",filterRegionPatch,"filterModulePatchedSha256"],
    ["renderContextPatch",renderContextPatch,"renderContextPatchedSha256"],
    ["filterLivenessPatch",filterLivenessPatch,"filterLivenessPatchedSha256"],
    ["premultipliedTransferPatch",premultipliedTransferPatch,"premultipliedTransferPatchedSha256"]]){
    assert.equal(receipt[name]?.patchedSha256,expected.patchedSha256,name);
    assert.equal(pins[pinName],expected.patchedSha256,pinName);
  }
  assert.equal(receipt.sourcePremultipliedTransferChanged,true);
  assert.equal(receipt.premultipliedTransferPatch.kernelSha256,premultipliedTransferPatch.kernelSha256);
  assert.equal(pins.premultipliedKernelSha256,premultipliedTransferPatch.kernelSha256);
  assert.equal(receipt.premultipliedTransferPatch.additionalTablePayloadBytes,131072);
  assert.equal(receipt.premultipliedTransferPatch.additionalStaticTableStorageUpperBoundBytes,131104);
  assert.equal(receipt.premultipliedTransferPatch.fullViewportFloatAccumulatorIntroduced,false);
  assert.equal(receipt.premultipliedTransferPatch.multiInputMergeLoopChanged,false);
  assert.equal(receipt.premultipliedTransferPatch.fixtureOrFilterParametersChanged,false);
  assert.equal(pins.experimentalMaximumBytes,100663296);
  assert.equal(pins.sourceRepeatPin,"images/resvg-source/filter-premultiplied-raw-input.json");
}
function bindPremultipliedCandidate(base,options){
  const suite=replace(base.suite,"images/resvg-source/filter-liveness-processed-input.json","images/resvg-source/filter-premultiplied-processed-input.json");
  let driver=replace(base.driver,JSON.stringify(sha(base.suite)),JSON.stringify(sha(suite)));
  driver=replace(driver,"images/resvg-source/filter-liveness-processed-input.json","images/resvg-source/filter-premultiplied-processed-input.json",2);
  driver=replace(driver,"images/resvg-source/filter-liveness-raw-input.json","images/resvg-source/filter-premultiplied-raw-input.json",2);
  driver=replace(driver,"two-pinned-liveness-source-postprocessing-passes-byte-identical-not-browser-acceptance","two-pinned-premultiplied-source-postprocessing-passes-byte-identical-not-browser-acceptance");
  driver=replace(driver,'  assert.equal(receipt.sourceIntermediateLifetimesChanged, true);',
    '  assert.equal(receipt.sourceIntermediateLifetimesChanged, true);\n  assertSvgPremultipliedSourceReceipt(receipt,pins);');
  driver=replace(driver,'"scripts/lib/svg-filter-liveness-qualification.mjs"',
    '"scripts/lib/svg-filter-liveness-qualification.mjs", "scripts/lib/svg-premultiplied-qualification.mjs", "images/resvg-source/premultiplied-transfer-patch.mjs", "images/resvg-source/premultiplied-transfer-kernel.rs"');
  driver=replace(driver,'report.sourceFilterLivenessCandidate = true;',
    'report.sourceFilterLivenessCandidate = true;\nreport.sourcePremultipliedTransferCandidate = true;');
  driver=`import {assertSvgPremultipliedSourceReceipt} from ${JSON.stringify(pathToFileURL(path.join(options.root,"scripts/lib/svg-premultiplied-qualification.mjs")).href)};\n`+driver;
  return {...base,suite,driver,proof:{...base.proof,suiteSha256:sha(suite),driverSha256:sha(driver),
    sourcePremultipliedTransferCandidate:true,premultipliedTransferPatch,allFourSourcePatchProofsRequired:true,
    originalInputAndAllExistingAcceptanceAssertionsRetained:true,publicPromotion:false}};
}
export function makePremultipliedSvgQualification(options){return bindPremultipliedCandidate(makeFilterLivenessSvgQualification(options),options);}
export function makeSvgSmallPremultipliedControl(options){return bindPremultipliedCandidate(makeSvgSmallFidelityControl(options),options);}
