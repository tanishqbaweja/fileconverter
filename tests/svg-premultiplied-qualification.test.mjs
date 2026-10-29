import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { assertSvgPremultipliedSourceReceipt,makePremultipliedSvgQualification,makeSvgSmallPremultipliedControl } from "../scripts/lib/svg-premultiplied-qualification.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { filterRegionPatch } from "../images/resvg-source/filter-region-patch.mjs";
import { renderContextPatch } from "../images/resvg-source/render-context-patch.mjs";
import { filterLivenessPatch } from "../images/resvg-source/filter-liveness-patch.mjs";
import { premultipliedTransferPatch } from "../images/resvg-source/premultiplied-transfer-patch.mjs";
test("premultiplied assertion requires its own four proofs and rejects rejected-float lineage, changed maximum or workspace semantics",async()=>{
  const pins=JSON.parse(await readFile("images/resvg-source/filter-premultiplied-processed-input.json"));
  const receipt={filterRegionPatch,renderContextPatch,filterLivenessPatch,premultipliedTransferPatch,sourcePremultipliedTransferChanged:true};
  assert.doesNotThrow(()=>assertSvgPremultipliedSourceReceipt(receipt,pins));
  for(const field of ["filterRegionPatch","renderContextPatch","filterLivenessPatch","premultipliedTransferPatch"]){const changed=structuredClone(receipt);delete changed[field];assert.throws(()=>assertSvgPremultipliedSourceReceipt(changed,pins));}
  for(const [field,value]of [["premultipliedTransferPatchedSha256","a".repeat(64)],["premultipliedKernelSha256","b".repeat(64)],["experimentalMaximumBytes",201326592],["sourceRepeatPin","images/resvg-source/filter-precision-raw-input.json"]])
    assert.throws(()=>assertSvgPremultipliedSourceReceipt(receipt,{...pins,[field]:value}));
  assert.throws(()=>assertSvgPremultipliedSourceReceipt({...receipt,premultipliedTransferPatch:{...premultipliedTransferPatch,fullViewportFloatAccumulatorIntroduced:true}},pins));
});
test("new native browser recipes retain exact large/small scene gates and production IO rather than weaker diagnostic inputs",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const options={root:process.cwd(),runtime:runtime.directory,
      workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:128,bytes:1234,sha256:"a".repeat(64)},
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),controlTestBytes:await readFile("scripts/lib/svg-small-fidelity-test.txt")};
    for(const make of [makePremultipliedSvgQualification,makeSvgSmallPremultipliedControl]){
      const result=make(options);assert.equal(result.proof.allFourSourcePatchProofsRequired,true);assert.equal(result.proof.publicPromotion,false);
      assert.match(result.driver,/assertSvgPremultipliedSourceReceipt\(receipt,pins\)/);assert.match(result.driver,/filter-premultiplied-raw-input.json/);
      assert.match(result.driver,/incrementalPrivateMiB <= 250/);assert.match(result.driver,/pins.experimentalMaximumBytes, 100663296/);
      assert.match(result.suite,/filter-premultiplied-processed-input.json/);assert.doesNotMatch(result.suite,/bypassCSP|setBypassCSP|--disable-web-security/);
      if(make===makeSvgSmallPremultipliedControl){assert.equal(result.proof.fullOriginal6MStressReplacement,false);assert.ok(result.suite.endsWith(options.controlTestBytes.toString()));
        assert.match(result.driver,/"--grep", "paired-svg-fidelity-control"/);assert.match(result.suite,/row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/);assert.match(result.suite,/expect\(results\[0\].rgbaSha256\).toBe\(results\[1\].rgbaSha256\)/);
      }else assert.match(result.driver,/"--grep", "6m-effects-repeat-\[123\]"/);
      for(const [name,source]of [["driver.mjs",result.driver],["suite.ts",result.suite]])assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
    }
  }finally{await runtime.close();}
});
