// Exact same private strip suite, now bound to independently rebuilt source bytes.
import assert from "node:assert/strict";
import { makeSvgStripQualification } from "./svg-strip-qualification-recipe.mjs";
import { filterRegionPatch } from "../../images/resvg-source/filter-region-patch.mjs";
import { sha } from "../../images/resvg-source/source-pins.mjs";
const replace=(source,before,after,count=1)=>{assert.equal(source.split(before).length-1,count,"Exact source-region qualifier anchor: "+before);return source.split(before).join(after);};
export function makeFilterRegionSvgQualification(options){
  const base=makeSvgStripQualification(options),suite=replace(base.suite,"images/resvg-source/repeated-processed-input.json","images/resvg-source/filter-region-processed-input.json");
  let driver=replace(base.driver,JSON.stringify(sha(base.suite)),JSON.stringify(sha(suite)));
  driver=replace(driver,"images/resvg-source/repeated-processed-input.json","images/resvg-source/filter-region-processed-input.json",2);
  driver=replace(driver,'assert.deepEqual(names, [pins.receiptMember, pins.wasmMember, pins.glueMember].sort());',
    'assert.deepEqual(names, [pins.ownerReceiptMember, pins.receiptMember, pins.wasmMember, pins.glueMember].sort());\n'+
    '  assert.equal(members[pins.ownerReceiptMember].length, pins.ownerReceiptBytes);\n'+
    '  assert.equal(sha(members[pins.ownerReceiptMember]), pins.ownerReceiptSha256);\n'+
    '  const filterOwner = JSON.parse(Buffer.from(members[pins.ownerReceiptMember]).toString());\n'+
    '  assert.equal(filterOwner.status, "two-pinned-filter-source-postprocessing-passes-byte-identical-not-browser-acceptance");\n'+
    '  assert.equal(filterOwner.ownedOwnerScratchRemoved, true); assert.deepEqual(filterOwner.failures, []);\n'+
    '  assert.equal(filterOwner.processedReceipt.sha256, pins.receiptSha256);\n'+
    '  assert.equal(filterOwner.candidate.wasmSha256, pins.wasmSha256);');
  driver=replace(driver,'  assert.equal(receipt.processedWasmAndGlueByteIdentical, true);',
    '  assert.equal(receipt.processedWasmAndGlueByteIdentical, true);\n'+
    '  assert.equal(receipt.sourceAllocationExtentChanged, true);\n'+
    '  assert.equal(receipt.filterRegionPatch.patchedSha256, '+JSON.stringify(filterRegionPatch.patchedSha256)+');\n'+
    '  assert.deepEqual(receipt.inputPin, JSON.parse(await readFile(path.join(root,"images/resvg-source/filter-region-raw-input.json"))));');
  driver=replace(driver,'"scripts/lib/svg-strip-validator.mjs"];',
    '"scripts/lib/svg-strip-validator.mjs", "scripts/lib/svg-filter-region-qualification.mjs", "images/resvg-source/filter-region-raw-input.json", "images/resvg-source/filter-region-patch.mjs"];');
  driver=replace(driver,"report.candidatePin = pins;","report.candidatePin = pins;\nassert.equal(pins.experimentalMaximumBytes, 100663296);\nreport.sourceFilterRegionCandidate = true;");
  return{...base,driver,suite,proof:{...base.proof,driverSha256:sha(driver),suiteSha256:sha(suite),
    sourceFilterRegionCandidate:true,sourcePatch:filterRegionPatch,fourExactArtifactMembersRequired:true,
    allExistingFidelityMemoryPrivacyCleanupAssertionsRetained:true,publicPromotion:false}};
}
