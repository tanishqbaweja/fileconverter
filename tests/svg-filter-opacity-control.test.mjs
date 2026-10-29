import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { svgFilterOpacityVariants,makeSvgPrecisionOpacityControl } from "../scripts/lib/svg-filter-opacity-control.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { assertSvgComponentControlNotCompleted } from "../scripts/lib/svg-component-fidelity-control.mjs";
test("opacity sources isolate identical flood/composite geometry at1/0.65/0.9 with no blur or offset",async()=>{
  const bytes=await readFile("fixtures/images/test-pattern-effects.svg"),variants=svgFilterOpacityVariants(bytes);
  assert.deepEqual(variants.map(row=>row.changes.opacity),[1,0.65,0.9]);
  const geometry=bytes.toString().slice(bytes.toString().indexOf('</filter>'));
  for(const row of variants){assert.equal(row.source.slice(row.source.indexOf('</filter>')),geometry);assert.doesNotMatch(row.source,/<feGaussianBlur|<feOffset/);assert.match(row.source,/in2="SourceAlpha" operator="in"/);assert.match(row.source,/flood-color="#08121d"/);}
  assert.throws(()=>svgFilterOpacityVariants(Buffer.concat([bytes,Buffer.from(" ")])));
});
test("actual opacity controls match pre-recorded channel predictions without promoting failed quality or diagnostics to support",async()=>{
  const report=JSON.parse(await readFile("evidence/2026-10-29T08-13-45-616Z-svg-precision-opacity-control.json"));
  assert.equal(report.childExit,1);assert.equal(report.diagnostic.results.length,3);assert.equal(report.diagnostic.independentlyValidatedEffects,false);
  const [opaque,partial,nearly]=report.diagnostic.results,center=row=>row.pixelSamples.find(sample=>sample.x===90&&sample.y===30);
  assert.deepEqual(center(opaque).referenceRgba,[13,22,28,255]);assert.deepEqual(center(opaque).outputRgba,[13,22,28,255]);
  assert.deepEqual(center(partial).referenceRgba,[7,30,45,255]);assert.deepEqual(center(partial).outputRgba,[19,30,45,255]);
  assert.deepEqual(center(nearly).referenceRgba,[15,18,35,255]);assert.deepEqual(center(nearly).outputRgba,[15,26,34,255]);
  assert.deepEqual(report.diagnostic.results.map(row=>[row.wholeSsim,row.minimumBandSsim]),[[0.998779,0.994108],[0.948321,0.923506],[0.98693,0.979694]]);
  assert.equal(report.memoryAcceptance,false);assert.equal(report.publicPromotion,false);assert.equal(report.ownedRuntimeRemoved,true);assert.equal(report.ownedBrowserRuntimeRemoved,true);
  assert.deepEqual(report.protectedOriginalBefore,report.protectedOriginalAfter);assert.ok(report.processCleanup.every(row=>row.status==="owned-identity-absent"));
  const ledger=JSON.parse(await readFile("images/resvg-source/rejected-strip-experiments.json")),variants=svgFilterOpacityVariants(await readFile("fixtures/images/test-pattern-effects.svg"));
  assert.throws(()=>assertSvgComponentControlNotCompleted(ledger,{nativeWasmSha256:ledger.completedPrecisionOpacityControl.nativeWasmSha256,variants,opacityDiagnostics:true}),/already complete/);
});
test("opacity recipe preserves bounded pixel evidence, four-proof lineage, real UI/IO, cleanup and original acceptance gates",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const result=makeSvgPrecisionOpacityControl({root:process.cwd(),runtime:runtime.directory,
      workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:128,bytes:1234,sha256:"a".repeat(64)},
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),controlTestBytes:await readFile("scripts/lib/svg-small-fidelity-test.txt"),componentSourceBytes:await readFile("fixtures/images/test-pattern-effects.svg")});
    assert.equal(result.proof.opacityDiagnostics,true);assert.equal(result.proof.allFourSourcePatchProofsRequired,true);assert.equal(result.proof.publicPromotion,false);assert.equal(result.proof.fullOriginal6MStressReplacement,false);
    assert.match(result.driver,/"--grep", "svg-filter-opacity-control"/);assert.match(result.driver,/assertSvgPrecisionSourceReceipt\(receipt,pins\)/);
    assert.match(result.driver,/incrementalPrivateMiB <= 250/);assert.match(result.driver,/pins.experimentalMaximumBytes, 100663296/);
    assert.match(result.suite,/Array.from\(\{length:64\}/);assert.match(result.suite,/worstPixels.length>12/);
    assert.match(result.suite,/row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/);assert.match(result.suite,/row.alphaExact\).toBe\(true\)/);
    assert.match(result.suite,/await rm\(referencePath,\{force:true\}\);await rm\(sourcePath,\{force:true\}\)/);
    for(const [name,source]of [["driver.mjs",result.driver],["suite.ts",result.suite]])assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
  }finally{await runtime.close();}
});
