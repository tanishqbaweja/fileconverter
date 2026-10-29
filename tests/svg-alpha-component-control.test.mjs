import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { summarizeSvgAlphaDifference } from "../scripts/lib/svg-alpha-difference.mjs";
import { svgAlphaComponentVariants, assertSvgAlphaComponentsNotCompleted } from "../scripts/lib/svg-alpha-component-variants.mjs";
import { makeSvgAlphaComponentControl } from "../scripts/lib/svg-alpha-component-control.mjs";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";

test("alpha diagnostics independently count every pixel, retain coordinates and preserve decoded source bytes without rendering", () => {
  const reference = Uint8Array.from([1,2,3,0, 4,5,6,128, 7,8,9,200, 10,11,12,255]);
  const output = Uint8Array.from([1,2,3,0, 4,5,6,127, 7,8,9,250, 10,11,12,200]);
  const copy = output.slice();
  const value = summarizeSvgAlphaDifference({ output, reference, width: 2, height: 2, samples: [{ kind: "corner", x: 1, y: 1 }] });
  assert.deepEqual(output, copy); assert.equal(value.comparedPixels, 4); assert.equal(value.mismatchedPixels, 3);
  assert.equal(value.maximumAbsoluteError, 55); assert.equal(value.referenceTransparentPixels, 1); assert.equal(value.referencePartialPixels, 2);
  assert.equal(value.differenceCounts.reduce((a,b) => a+b), 4);
  assert.deepEqual(value.worstPixels.map(({x,y,absoluteError}) => ({x,y,absoluteError})),
    [{x:1,y:1,absoluteError:55},{x:0,y:1,absoluteError:50},{x:1,y:0,absoluteError:1}]);
  assert.deepEqual(value.fixedSamples[0], { kind: "corner", x: 1, y: 1, referenceRgba: [10,11,12,255], outputRgba: [10,11,12,200] });
  const equal = summarizeSvgAlphaDifference({ output: reference, reference, width: 2, height: 2 });
  assert.equal(equal.mismatchedPixels, 0); assert.deepEqual(equal.worstPixels, []);
});

test("spatial diagnostics have hard bounds, never a retained per-pixel object history or fabricated missing sample", () => {
  const output = new Uint8Array(20*20*4), reference = new Uint8Array(output.length);
  for (let at=3; at<output.length; at+=4) output[at] = (at/4|0)%256;
  const options = { output, reference, width: 20, height: 20, samples: Array.from({length:64},(_,i)=>({kind:"fixed",x:i%20,y:Math.floor(i/20)})) };
  const value = summarizeSvgAlphaDifference(options); assert.equal(value.fixedSamples.length,64); assert.equal(value.worstPixels.length,12);
  assert.equal(value.worstPixels[0].absoluteError,255); assert.equal(value.referenceHistogram.reduce((a,b)=>a+b),400);
  assert.throws(()=>summarizeSvgAlphaDifference({...options,samples:[...options.samples,options.samples[0]]}));
  assert.throws(()=>summarizeSvgAlphaDifference({...options,samples:[{kind:"bad",x:20,y:0}]}));
  assert.throws(()=>summarizeSvgAlphaDifference({...options,output:output.subarray(1)}));
  assert.throws(()=>summarizeSvgAlphaDifference({...options,width:961}));
});

test("three alpha components are distinct reversible changes with predictions fixed before execution", async () => {
  const original = await readFile("fixtures/images/svg-strip-filtered-alpha.svg"), variants = svgAlphaComponentVariants(original);
  assert.deepEqual(variants.map(v=>v.name),["rounded-no-filter","square-no-filter","square-filtered"]);
  assert.equal(new Set(variants.map(v=>v.sha256)).size,3); assert.ok(variants.every(v=>v.sha256!==sha(original)));
  assert.equal(variants[0].source.replace('<g mask="url(#bounded-mask)"><g>','<g mask="url(#bounded-mask)"><g filter="url(#bounded-shadow)">'),original.toString());
  assert.ok(variants[0].source.includes('rx="10"')); assert.ok(!variants[1].source.includes('rx="10"'));
  assert.ok(variants[2].source.includes('<g filter="url(#bounded-shadow)">'));
  assert.deepEqual(variants.map(v=>v.expectPartialAlpha),[true,false,true]);
  for (const v of variants) {
    assert.equal(v.bytes,Buffer.byteLength(v.source)); assert.equal(v.sha256,sha(v.source));
    assert.ok(v.hypothesis.length>20); assert.equal(v.sampleCoordinates.length,64);
    assert.ok(v.sampleCoordinates.every(({x,y})=>Number.isSafeInteger(x)&&x>=0&&x<960&&Number.isSafeInteger(y)&&y>=0&&y<540));
    assert.equal((v.source.match(/<feGaussianBlur/g)??[]).length,1);
  }
  const native="a".repeat(64),ledger={completedPremultipliedAlphaComponents:{nativeWasmSha256:native,variants:variants.map(({name,sha256})=>({name,sha256})),evidence:"retained"}};
  assert.throws(()=>assertSvgAlphaComponentsNotCompleted(ledger,native,variants),/already complete/);
  assertSvgAlphaComponentsNotCompleted({},native,variants); assert.throws(()=>svgAlphaComponentVariants(Buffer.from("wrong")));
});

test("alpha-component recipe collects all three before unchanged quality verdict, with real IO and full memory formula", async () => {
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try {
    const result=makeSvgAlphaComponentControl({root:process.cwd(),runtime:runtime.directory,
      workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:128,bytes:1234,sha256:"a".repeat(64)},
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),controlTestBytes:await readFile("scripts/lib/svg-small-fidelity-test.txt"),
      filteredAlphaSourceBytes:await readFile("fixtures/images/svg-strip-filtered-alpha.svg")});
    const body=result.suite.slice(result.suite.indexOf('test("svg-alpha-components-control",'));
    assert.ok(body.indexOf("for(const component of variants)")<body.indexOf("for(const mode of"));
    assert.match(body,/for\(const mode of \["full"\]\)/); assert.match(body,/expect\(results.length\).toBe\(3\)/);
    assert.ok(body.indexOf("await rm(sourcePath")<body.indexOf("for(const row of results)"));
    for(const gate of [/row.alphaExact\).toBe\(true\)/,/mismatchedPixels\).toBe\(0\)/,/row.wholeSsim\).toBeGreaterThanOrEqual\(0.99\)/,
      /row.minimumBandSsim\).toBeGreaterThanOrEqual\(0.99\)/,/spatialAlpha.fixedSamples.length\).toBe\(64\)/,/spatialAlpha.worstPixels.length\).toBeLessThanOrEqual\(12\)/])assert.match(body,gate);
    assert.match(body,/root.removeEntry\(name\)/); assert.match(body,/await rm\(referencePath/);
    assert.match(result.driver,/pins.experimentalMaximumBytes, 100663296/); assert.match(result.driver,/incrementalPrivateMiB <= 250/);
    assert.match(result.driver,/assertSvgPremultipliedSourceReceipt/); assert.match(result.driver,/owned-identity-absent/);
    assert.doesNotMatch(result.driver,/--disable-|ignoreDefaultArgs/);
    assert.equal(result.proof.bothModesSameNativeBytesAndProductionIo,false); assert.equal(result.proof.fullFrameProductionWorkerOnly,true);
    assert.equal(result.proof.fullOriginal6MStressReplacement,false); assert.equal(result.proof.publicPromotion,false);
    for(const [name,source]of [["driver.mjs",result.driver],["suite.ts",result.suite]])
      assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[],name);
  } finally { await runtime.close(); }
});

test("collected components prove separate geometry/filter mismatches while preserving failed overall verdict and no replay", async () => {
  const c=JSON.parse(await readFile("evidence/2026-10-29-svg-alpha-components-terminal.json"));
  const bytes=await readFile(c.browserReceipt.path),b=JSON.parse(bytes),p=JSON.parse(await readFile(c.parentReceipt.path));
  assert.equal(bytes.length,c.browserReceipt.bytes);assert.equal(sha(bytes),c.browserReceipt.sha256);
  assert.equal(b.executedHead,c.sourceHead);assert.equal(p.childExit,1);
  assert.deepEqual([p.stats.expected,p.stats.unexpected,p.stats.skipped,p.stats.flaky],[0,1,0,0]);
  assert.equal(p.diagnostic.results.length,3);
  assert.deepEqual(p.diagnostic.results.map(r=>[r.component,r.alphaDiagnostics.mismatchedPixels,r.alphaDiagnostics.maximumAbsoluteError]),
    [["rounded-no-filter",7776,18],["square-no-filter",0,0],["square-filtered",38067,34]]);
  for(const r of p.diagnostic.results){assert.ok(r.wholeSsim>=0.99&&r.minimumBandSsim>=0.99);assert.equal(r.spatialAlpha.fixedSamples.length,64);
    assert.ok(r.spatialAlpha.worstPixels.length<=12);assert.equal(r.spatialAlpha.differenceCounts.reduce((a,b)=>a+b),960*540);}
  const square=p.diagnostic.results[1];assert.equal(square.alphaExact,true);assert.equal(square.wholeSsim,1);assert.equal(square.minimumBandSsim,1);
  assert.equal(square.alphaDiagnostics.referencePartialPixels,0);
  const edge=p.diagnostic.results[2].spatialAlpha.worstPixels[0];assert.deepEqual([edge.x,edge.y,edge.referenceRgba[3],edge.outputRgba[3]],[58,6,82,48]);
  assert.equal(c.memory.incrementalPrivateMiB,(b.memory.peak.privateBytes-b.blankBaseline.privateBytes)/1048576);
  assert.equal(c.memory.unavailableSamples,0);assert.deepEqual(b.forbiddenRequests,[]);assert.equal(b.forbiddenRequestOverflow,false);
  assert.ok(p.processCleanup.every(r=>r.status==="owned-identity-absent"));assert.equal(p.ownerProcessCleanup.status,"owned-identity-absent");
  assert.equal(p.ownedRuntimeRemoved,true);assert.equal(p.ownedBrowserRuntimeRemoved,true);assert.deepEqual(p.protectedOriginalBefore,p.protectedOriginalAfter);
  assert.equal(c.nativeRebuildPerformed,false);assert.equal(c.publicPromotion,false);assert.equal(c.wholeGoalComplete,false);
  const variants=svgAlphaComponentVariants(await readFile("fixtures/images/svg-strip-filtered-alpha.svg"));
  const ledger=JSON.parse(await readFile("images/resvg-source/rejected-strip-experiments.json"));
  assert.throws(()=>assertSvgAlphaComponentsNotCompleted(ledger,c.nativeWasmSha256,variants));
});
