import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeSvgStripTransparentControl,svgTransparentControlPin } from "../scripts/lib/svg-strip-transparent-control.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
test("new transparent fixture is exactly pinned, analytically covers every pixel and does not alter historical opaque controls",async()=>{
  const bytes=await readFile("fixtures/images/svg-strip-transparent.svg");
  assert.equal(bytes.length,svgTransparentControlPin.bytes);assert.equal(sha(bytes),svgTransparentControlPin.sha256);
  assert.equal(Object.values(svgTransparentControlPin.alphaCounts).reduce((a,b)=>a+b,0),960*540);
  assert.deepEqual(svgTransparentControlPin.alphaCounts,{0:129600,64:64800,128:129600,191:64800,255:129600});
  assert.doesNotMatch(bytes.toString(),/filter|href=|script|foreignObject|<image/);
  assert.equal(sha(await readFile("fixtures/images/test-pattern-effects.svg")),"afebfa848cd052fcd656cfdda7605c6c191edf845087759ca3421cf44880981d");
});
test("transparent production-browser recipe retains same native4proof cap, IO, exact mode equality, quality, every alpha bin and strict memory",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const options={root:process.cwd(),runtime:runtime.directory,
      workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:128,bytes:1234,sha256:"a".repeat(64)},
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),controlTestBytes:await readFile("scripts/lib/svg-small-fidelity-test.txt"),
      transparentSourceBytes:await readFile("fixtures/images/svg-strip-transparent.svg")};
    const result=makeSvgStripTransparentControl(options);
    assert.equal(result.proof.allFourSourcePatchProofsRequired,true);assert.equal(result.proof.fullOriginal6MStressReplacement,false);
    assert.equal(result.proof.filteredAlphaCoverage,false);assert.equal(result.proof.publicPromotion,false);
    assert.match(result.suite,/alphaBins=new Uint32Array\(256\)/);assert.match(result.suite,/row.alphaCounts\).toEqual/);
    assert.match(result.suite,/row.allReferenceAlphaOpaque\).toBe\(false\)/);
    assert.match(result.suite,/row.alphaExact\).toBe\(true\)/);assert.match(result.suite,/row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/);
    assert.match(result.suite,/results\[0\].rgbaSha256\).toBe\(results\[1\].rgbaSha256\)/);
    assert.match(result.suite,/peakImageWorkingBytes\).toBeGreaterThan\(0\)/);assert.match(result.suite,/imageWorkingBytes\).toBe\(0\)/);
    assert.match(result.driver,/"--grep", "svg-transparent-fidelity-control"/);assert.match(result.driver,/incrementalPrivateMiB <= 250/);
    assert.match(result.driver,/pins.experimentalMaximumBytes, 100663296/);assert.doesNotMatch(result.suite,/bypassCSP|setBypassCSP/);
    const body=result.suite.slice(result.suite.indexOf('test("svg-transparent-fidelity-control",'));
    assert.doesNotMatch(body,/test-pattern-effects\.(?:svg|png)/);
    assert.match(body,/batchOutputNames\).toEqual\(\["svg-strip-transparent.png"\]\)/);
    assert.match(body,/await transfer\("svg-strip-transparent.png"\)/);assert.match(body,/root.removeEntry\("svg-strip-transparent.png"\)/);
    for(const [name,source]of [["driver.mjs",result.driver],["suite.ts",result.suite]])assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
    assert.throws(()=>makeSvgStripTransparentControl({...options,transparentSourceBytes:Buffer.from("wrong")}));
  }finally{await runtime.close();}
});
