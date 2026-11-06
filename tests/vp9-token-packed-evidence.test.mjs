import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {verifyVp9TokenPackedAudit} from "../media/ffmpeg/vp9-token-packed-audit.mjs";
const root=new URL("../",import.meta.url),read=file=>readFile(new URL(file,root)),json=async file=>JSON.parse(await read(file)),sha=s=>createHash("sha256").update(s).digest("hex"),
  report=await json("evidence/2026-11-06-vp9-token-packed-source-qualification.json");
test("actual source qualification authenticates whole-archive domain inventory and generated recipe, no linked/browser/speed claims",async()=>{
  const bytes=await read(report.sourceAudit.file),audit=JSON.parse(bytes);assert.equal(sha(bytes),report.sourceAudit.sha256);
  assert.deepEqual(verifyVp9TokenPackedAudit(audit),report.reviewedDomain);
  assert.equal(sha(await read("media/ffmpeg/vp9-token-packed-recipe.mjs")),report.recipeSha256);
  assert.equal(report.previousActualHighBitDepth,0);assert.equal(report.previousActualRecordBytes,6);
  assert.equal(report.candidateActualLibraryLayout,null);assert.equal(report.actualMemorySavedBytes,null);
  for(const key of ["tokenCapacityChanged","entropyTokenValuesChanged","extraBitsChanged","memoryLimitsRaised","codecSettingsChanged",
    "pixelAlgorithmsChanged","wasmCodecBuilt","browserValidated","independentBitExactBrowserControlPassed","speedGainProven","publicAcceptance","userMediaReadOrConverted"])assert.equal(report[key],false);
});
test("actual Wasm32 layout controls prove six-to-four only in low-bit mode and actual compiled mock operations retain entropy results",()=>{
  assert.deepEqual(report.layout.variants.map(v=>[v.highBitDepth,v.previousRecordBytes,v.packedRecordBytes,v.extraOffset]),[[0,6,4,2],[1,8,8,4]]);
  assert.deepEqual(report.cUnit.variants.map(v=>v.optimization),["-O0","-O2","-O0","-O2"]);
  assert.equal(report.cUnit.variants.reduce((n,v)=>n+v.producerPackerCases,0),552960);
  assert.ok(report.cUnit.variants.every(v=>v.extraBitPatterns===65536&&v.contextIndices===1024));
  assert.equal(report.cUnit.nativeCodecConversion,false);assert.equal(report.cUnit.publicAcceptance,false);
  assert.deepEqual(report.internalSentinel,{old:127,candidate:15,signalled:false});
});
