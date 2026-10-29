import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import { createOwnedRuntimeScratch } from "../scripts/lib/owned-runtime-scratch.mjs";
import { makeSvgNativeWorkerCapabilityControl } from "../scripts/lib/svg-native-worker-capability-control.mjs";
test("native SVG capability probe remains a fixed4pixel worker-only feature test, not a converted supported profile or paired-control replay",async()=>{
  const runtime=await createOwnedRuntimeScratch("svg-reproduced-qualification-");
  try{
    const options={root:process.cwd(),runtime:runtime.directory,
      workerPin:{file:path.join(runtime.directory,"private-svg-strip-worker.mjs"),centralRows:128,bytes:1234,sha256:"a".repeat(64)},
      driverBytes:await readFile("scripts/test-source-built-svg-candidate.mjs"),suiteBytes:await readFile("tests/browser/image-conversions.spec.ts"),
      generatorBytes:await readFile("scripts/generate-svg-stress-fixture.py"),controlTestBytes:await readFile("scripts/lib/svg-small-fidelity-test.txt"),
      capabilityTestBytes:await readFile("scripts/lib/svg-native-worker-test.txt")};
    const result=makeSvgNativeWorkerCapabilityControl(options);
    assert.equal(result.proof.productionConversionProfileTested,false);assert.equal(result.proof.browserWorkerApiProbeOnly,true);
    assert.match(result.driver,/row.result\?\.nativeWorkerCapabilityProbeCompleted === true/);assert.match(result.driver,/incrementalPrivateMiB <= 250/);
    assert.match(result.suite,/worker.terminate\(\);URL.revokeObjectURL\(url\)/);
    assert.match(result.suite,/svg-native-worker-capability-control/);
    const fragment=options.capabilityTestBytes.toString();assert.doesNotMatch(fragment,/setInputFiles|bypassCSP|disable-/);
    const worker=await readFile("scripts/lib/svg-native-worker-probe.txt","utf8");
    assert.match(worker,/ImageDecoder.isTypeSupported\("image\/svg\+xml"\)/);
    assert.match(worker,/pngPositiveControl/);assert.match(worker,/bitmap\?\.close\(\)/);
    assert.doesNotMatch(worker,/\bfetch\(|XMLHttpRequest|WebSocket|importScripts|arrayBuffer\(/);
    const file=path.join(runtime.directory,"probe.mjs");await writeFile(file,worker,{flag:"wx"});
    await promisify(execFile)(process.execPath,["--check",file],{env:runtime.env,windowsHide:true,timeout:10000,maxBuffer:16384});
    for(const [name,source]of [["driver.mjs",result.driver],["suite.ts",result.suite]])
      assert.deepEqual(ts.createSourceFile(name,source,ts.ScriptTarget.ESNext,true).parseDiagnostics,[]);
  }finally{await runtime.close();}
});
test("actual worker SVG unavailability cannot be advertised as a native conversion backend despite a passing PNG positive control",async()=>{
  const report=JSON.parse(await readFile("evidence/2026-10-29T06-31-19-843Z-svg-native-worker-capability.json"));
  const result=report.diagnostic.result;
  assert.equal(result.probeCompleted,true);assert.equal(result.crossOriginIsolated,true);
  assert.equal(result.pngPositiveControl.exact,true);assert.equal(result.pngPositiveControl.width,2);assert.equal(result.pngPositiveControl.height,2);
  assert.equal(result.svgBitmap.error.name,"InvalidStateError");assert.equal(result.svgImageDecoder.supported,false);
  assert.deepEqual(result.securityViolations,[]);assert.equal(result.conversionProfileTested,false);
  assert.equal(report.publicPromotion,false);assert.equal(report.wholeGoalComplete,false);assert.equal(report.ownedRuntimeRemoved,true);
  assert.equal(report.ownerProcessCleanup.status,"owned-identity-absent");assert.ok(report.processCleanup.every(row=>row.status==="owned-identity-absent"));
  assert.deepEqual(report.protectedOriginalBefore,report.protectedOriginalAfter);
});
