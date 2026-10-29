// Changed native bytes, same three component inputs, production worker/IO and gates.
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { makeSvgAlphaComponentControl } from "./svg-alpha-component-control.mjs";
import { filterRegionPatch } from "../../images/resvg-source/filter-region-patch.mjs";
import { renderContextPatch } from "../../images/resvg-source/render-context-patch.mjs";
import { filterLivenessPatch } from "../../images/resvg-source/filter-liveness-patch.mjs";
import { premultipliedTransferPatch } from "../../images/resvg-source/premultiplied-transfer-patch.mjs";
import { blurBoundaryPatch } from "../../images/resvg-source/blur-boundary-patch.mjs";
import { boundaryNumericTestsSha256 } from "../../images/resvg-source/blur-boundary-postprocess-recipe.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace = (source, before, after, count = 1) => {
  assert.equal(source.split(before).length - 1, count, "Exact boundary qualification anchor: " + before);
  return source.split(before).join(after);
};
export function assertSvgBlurBoundarySourceReceipt(receipt, pins) {
  for (const [name, patch, field] of [["filterRegionPatch", filterRegionPatch, "filterModulePatchedSha256"],
    ["renderContextPatch", renderContextPatch, "renderContextPatchedSha256"],
    ["filterLivenessPatch", filterLivenessPatch, "filterLivenessPatchedSha256"],
    ["premultipliedTransferPatch", premultipliedTransferPatch, "premultipliedTransferPatchedSha256"],
    ["blurBoundaryPatch", blurBoundaryPatch, "blurBoundaryPatchedSha256"]]) {
    assert.equal(receipt[name]?.patchedSha256, patch.patchedSha256, name); assert.equal(pins[field], patch.patchedSha256, field);
  }
  assert.equal(receipt.sourcePremultipliedTransferChanged, true); assert.equal(receipt.sourceBlurBoundaryChanged, true);
  assert.equal(receipt.blurBoundaryPatch.nativeSourceRecipeIntegrated, true);
  assert.equal(receipt.premultipliedTransferPatch.kernelSha256, premultipliedTransferPatch.kernelSha256);
  assert.equal(pins.premultipliedKernelSha256, premultipliedTransferPatch.kernelSha256);
  assert.equal(pins.blurBoundaryNumericTestsSha256, boundaryNumericTestsSha256);
  assert.equal(receipt.premultipliedTransferPatch.additionalTablePayloadBytes, 131072);
  assert.equal(receipt.premultipliedTransferPatch.additionalStaticTableStorageUpperBoundBytes, 131104);
  for (const field of ["fullViewportFloatAccumulatorIntroduced", "multiInputMergeLoopChanged", "fixtureOrFilterParametersChanged"])
    assert.equal(receipt.premultipliedTransferPatch[field], false);
  assert.equal(receipt.blurBoundaryPatch.kernelWeightsRoundingOrPassCountChanged, false);
  assert.equal(pins.experimentalMaximumBytes, 100663296);
  assert.equal(pins.sourceRepeatPin, "images/resvg-source/filter-blur-boundary-raw-input.json");
}
export function makeSvgBlurBoundaryAlphaControl(options) {
  const base = makeSvgAlphaComponentControl(options);
  const suite = replace(base.suite, "images/resvg-source/filter-premultiplied-processed-input.json", "images/resvg-source/filter-blur-boundary-processed-input.json");
  let driver = replace(base.driver, JSON.stringify(sha(base.suite)), JSON.stringify(sha(suite)));
  driver = replace(driver, "images/resvg-source/filter-premultiplied-processed-input.json", "images/resvg-source/filter-blur-boundary-processed-input.json", 2);
  driver = replace(driver, "images/resvg-source/filter-premultiplied-raw-input.json", "images/resvg-source/filter-blur-boundary-raw-input.json", 2);
  driver = replace(driver, "two-pinned-premultiplied-source-postprocessing-passes-byte-identical-not-browser-acceptance", "two-pinned-blur-boundary-source-postprocessing-passes-byte-identical-not-browser-acceptance");
  const priorImport = 'import {assertSvgPremultipliedSourceReceipt} from ' + JSON.stringify(pathToFileURL(path.join(options.root, "scripts/lib/svg-premultiplied-qualification.mjs")).href) + ';';
  driver = replace(driver, priorImport, 'import {assertSvgBlurBoundarySourceReceipt as assertSvgPremultipliedSourceReceipt} from ' + JSON.stringify(pathToFileURL(path.join(options.root, "scripts/lib/svg-blur-boundary-qualification.mjs")).href) + ';');
  driver = replace(driver, 'report.sourcePremultipliedTransferCandidate = true;', 'report.sourcePremultipliedTransferCandidate = true;\nreport.sourceBlurBoundaryCandidate = true;');
  driver = replace(driver, '"scripts/lib/svg-premultiplied-qualification.mjs",', '"scripts/lib/svg-premultiplied-qualification.mjs", "scripts/lib/svg-blur-boundary-qualification.mjs", "images/resvg-source/blur-boundary-patch.mjs", "images/resvg-source/blur-boundary-kernel-tests.rs",');
  return { ...base, suite, driver, proof: { ...base.proof, suiteSha256: sha(suite), driverSha256: sha(driver),
    allFiveSourceProofsRequired: true, sourceBlurBoundaryCandidate: true, fixtureChangesRelativeToPriorComponentRun: false,
    originalAlphaGateRetained: true, maximumWasmBytesUnchanged: 100663296, publicPromotion: false } };
}
