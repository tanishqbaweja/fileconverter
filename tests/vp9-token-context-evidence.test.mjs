import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const json=async f=>JSON.parse(await readFile(new URL("../evidence/2026-11-06-"+f+".json",import.meta.url)));
test("complete pinned reference inventory preserves all token consumers without claiming native savings",async()=>{
  const r=await json("vp9-token-storage-source-audit");
  assert.equal(r.archiveSha256,"7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c");
  assert.equal(r.cFiles,880);assert.equal(r.references.length,15);
  assert.equal(r.references.reduce((n,f)=>n+f.matches.length,0),137);
  assert.equal(r.actualCompiledHighBitDepthConfiguration,null);assert.equal(r.actualTokenBytes,null);
  assert.equal(r.actualSavedBytes,null);assert.equal(r.publicAcceptance,false);assert.equal(r.userMediaReadOrConverted,false);
});
test("retained exact-C mock and genuine Wasm32 ABI controls are not relabelled codec/browser acceptance",async()=>{
  const r=await json("vp9-token-context-source-qualification"),source=await json("vp9-token-context-source-audit");
  assert.deepEqual(r.layout.variants.map(v=>[v.highBitDepth,v.originalRecordBytes,v.candidateRecordBytes]),[[0,8,6],[1,12,8]]);
  assert.deepEqual(r.cUnit.variants.map(v=>v.producerPackerCases),[69120,207360]);
  assert.equal(r.cUnit.nativeCodecConversion,false);assert.equal(r.actualMemorySavedBytes,null);
  assert.equal(r.frameContext.references.length,7);assert.equal(r.frameContext.observedEncoderFrameContextWritesAreObjectCopies,true);
  assert.equal(r.frameContext.sourceInventoryIsNotExhaustiveAliasOrMacroAnalysis,true);
  for(const [file,proof] of Object.entries(r.sources)) {
    let value=source.preimages[file].exactSource;
    assert.equal(createHash("sha256").update(value).digest("hex"),proof.parentSha256);
    for(const [before,after] of proof.edits){assert.equal(value.split(before).length,2);value=value.replace(before,after);}
    assert.equal(createHash("sha256").update(value).digest("hex"),proof.generatedSha256);
  }
  assert.equal(r.unchangedTokenCapacity,true);assert.equal(r.actualCompiledHighBitDepthConfiguration,null);
  for(const flag of ["wasmCodecBuilt","browserValidated","independentBitExactBrowserControlPassed","speedGainProven","publicAcceptance","userMediaReadOrConverted"])
    assert.equal(r[flag],false);
});
