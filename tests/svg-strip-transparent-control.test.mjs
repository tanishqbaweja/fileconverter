import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeSvgStripTransparentControl,svgTransparentControlPin } from "../scripts/lib/svg-strip-transparent-control.mjs";
import { sha } from "../images/resvg-source/source-pins.mjs";
import { createHash } from "node:crypto";
test("actual production transparent outputs match independent row-wise golden and all alpha counts without borrowing large-scene acceptance",async()=>{
  const c=JSON.parse(await readFile("evidence/2026-10-29-svg-transparent-terminal.json"));
  const p=JSON.parse(await readFile(c.parentReceipt));const bytes=await readFile(c.browserReceipt.path),b=JSON.parse(bytes);
  assert.equal(bytes.length,c.browserReceipt.bytes);assert.equal(sha(bytes),c.browserReceipt.sha256);assert.equal(p.childExit,0);
  assert.equal(b.candidatePin.wasmSha256,c.nativeWasmSha256);assert.equal(b.sourcePins[c.source.path],c.source.sha256);
  assert.equal(b.transparentFidelityControl.sha256,c.source.sha256);
  const hash=createHash("sha256"),row=Buffer.alloc(960*4),colors=[[255,0,0,255],[0,255,0,128],[0,0,255,64],[255,255,255,191],[0,0,0,0]];
  for(let y=0;y<540;y++){
    for(let x=0;x<960;x++){
      const color=x<240?colors[0]:x<480?colors[1]:x<720&&y<270?colors[2]:x>=720&&y>=270?colors[3]:colors[4];
      for(let channel=0;channel<4;channel++)row[4*x+channel]=color[channel];
    }hash.update(row);
  }
  const golden=hash.digest("hex");assert.equal(golden,c.independentAnalyticGolden.rgbaSha256);assert.equal(row.length,3840);
  assert.equal(p.diagnostic.results.length,2);
  for(const r of p.diagnostic.results){assert.equal(r.rgbaSha256,golden);assert.equal(r.alphaExact,true);assert.equal(r.allReferenceAlphaOpaque,false);
    assert.deepEqual(r.alphaCounts,svgTransparentControlPin.alphaCounts);assert.equal(r.wholeSsim,1);assert.equal(r.minimumBandSsim,1);}
  assert.equal(p.diagnostic.results[1].metrics.peakImageWorkingBytes,c.strip.peakExplicitJsBufferBytes);
  assert.equal(p.diagnostic.results[1].metrics.imageWorkingBytes,0);
  assert.equal(p.incrementalPrivateMiB,(b.memory.peak.privateBytes-b.blankBaseline.privateBytes)/1048576);
  assert.equal(p.incrementalPrivateMiB,c.incrementalPrivateMiB);assert.equal(p.memoryAcceptance,false);assert.equal(c.publicPromotion,false);
  assert.equal(b.memory.unavailableSamples,0);assert.deepEqual(b.forbiddenRequests,[]);assert.equal(b.forbiddenRequestOverflow,false);
  assert.equal(b.ownedRuntimeRemoved,true);assert.ok(b.processCleanup.every(r=>r.status==="owned-identity-absent"));
  assert.deepEqual(b.protectedOriginalBefore,b.protectedOriginalAfter);
  const ledger=JSON.parse(await readFile("images/resvg-source/rejected-strip-experiments.json"));
  assert.equal(ledger.completedPremultipliedTransparentControl.sourceSha256,c.source.sha256);
});
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
