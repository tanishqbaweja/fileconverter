import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { assertSvgPrecisionSourceReceipt,makeFilterPrecisionSvgQualification,makeSvgSmallPrecisionFidelityControl } from "../scripts/lib/svg-filter-precision-qualification.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { filterRegionPatch } from "../images/resvg-source/filter-region-patch.mjs";
import { renderContextPatch } from "../images/resvg-source/render-context-patch.mjs";
import { filterLivenessPatch } from "../images/resvg-source/filter-liveness-patch.mjs";
import { filterPrecisionPatch } from "../images/resvg-source/filter-precision-patch.mjs";
test("four-proof native candidate assertion rejects missing or mutated source, kernel, maximum and input lineage",async()=>{
  const pins=JSON.parse(await readFile("images/resvg-source/filter-precision-processed-input.json"));
  const receipt={filterRegionPatch,renderContextPatch,filterLivenessPatch,filterPrecisionPatch,sourceFinalMergePrecisionChanged:true};
  assert.doesNotThrow(()=>assertSvgPrecisionSourceReceipt(receipt,pins));
  for(const field of ["filterRegionPatch","renderContextPatch","filterLivenessPatch","filterPrecisionPatch"]){
    const changed=structuredClone(receipt);delete changed[field];assert.throws(()=>assertSvgPrecisionSourceReceipt(changed,pins));
  }
  for(const [field,value]of [["filterPrecisionPatchedSha256","a".repeat(64)],["filterPrecisionKernelSha256","b".repeat(64)],["experimentalMaximumBytes",201326592],["sourceRepeatPin","images/resvg-source/filter-liveness-raw-input.json"]])
    assert.throws(()=>assertSvgPrecisionSourceReceipt(receipt,{...pins,[field]:value}));
  assert.throws(()=>assertSvgPrecisionSourceReceipt({...receipt,sourceFinalMergePrecisionChanged:false},pins));
});
test("precision browser recipes retain exact original large and small tests, source checks, UI/direct IO, cap and strict gates",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const options={root:process.cwd(),runtime:runtime.directory,
      workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:128,bytes:1234,sha256:"a".repeat(64)},
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),controlTestBytes:await readFile("scripts/lib/svg-small-fidelity-test.txt")};
    for(const make of [makeFilterPrecisionSvgQualification,makeSvgSmallPrecisionFidelityControl]){
      const result=make(options);assert.equal(result.proof.allFourSourcePatchProofsRequired,true);assert.equal(result.proof.publicPromotion,false);
      assert.match(result.driver,/assertSvgPrecisionSourceReceipt\(receipt,pins\)/);
      assert.match(result.driver,/filter-precision-raw-input.json/);assert.match(result.suite,/filter-precision-processed-input.json/);
      assert.match(result.driver,/incrementalPrivateMiB <= 250/);assert.match(result.driver,/pins.experimentalMaximumBytes, 100663296/);
      assert.doesNotMatch(result.suite,/bypassCSP|setBypassCSP|--disable-web-security/);
      if(make===makeSvgSmallPrecisionFidelityControl){
        assert.equal(result.proof.fullOriginal6MStressReplacement,false);
        assert.ok(result.suite.endsWith(options.controlTestBytes.toString()));
        assert.match(result.driver,/"--grep", "paired-svg-fidelity-control"/);
        assert.match(result.suite,/row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/);
        assert.match(result.suite,/expect\(results\[0\].rgbaSha256\).toBe\(results\[1\].rgbaSha256\)/);
      }else assert.match(result.driver,/"--grep", "6m-effects-repeat-\[123\]"/);
      for(const [name,source]of [["driver.mjs",result.driver],["suite.ts",result.suite]])
        assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
    }
  }finally{await runtime.close();}
});
