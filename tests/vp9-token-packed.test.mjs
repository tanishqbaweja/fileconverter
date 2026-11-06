import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {makeVp9TokenPackedSources} from "../media/ffmpeg/vp9-token-packed-recipe.mjs";
import {verifyVp9TokenPackedAudit} from "../media/ffmpeg/vp9-token-packed-audit.mjs";
import {runVp9TokenPackedCUnit} from "../media/ffmpeg/vp9-token-packed-c-unit.mjs";
const audit=JSON.parse(await readFile(new URL("../evidence/2026-11-06-vp9-token-packed-source-audit.json",import.meta.url))),
  preimages=Object.fromEntries(Object.entries(audit.preimages).map(([f,v])=>[f,v.exactSource]));
test("packed candidate reverses through actual six-byte parent without entropy/extra/capacity/settings changes",()=>{
  const candidate=makeVp9TokenPackedSources(preimages);
  for(const [file,row]of Object.entries(candidate.sources)) {
    let reverse=row.generated;for(const [before,after]of row.edits.toReversed()){assert.equal(reverse.split(after).length,2);reverse=reverse.replace(after,before);}
    assert.equal(reverse,candidate.parentContextSources[file].generated);
    for(const [before,after]of candidate.parentContextSources[file].edits.toReversed())reverse=reverse.replace(after,before);assert.equal(reverse,preimages[file]);
  }
  assert.deepEqual(candidate.internalSentinel,{old:127,candidate:15,signalled:false});
  for(const key of ["entropyTokenValuesChanged","extraBitsChanged","tokenCapacityChanged","codecSettingsChanged","pixelAlgorithmsChanged","memoryLimitsRaised","browserValidated","speedGainProven","publicAcceptance"])assert.equal(candidate[key],false);
  assert.equal(candidate.actualMemorySavedBytes,null);
});
test("source-domain audit binds all sentinel references and exact entropy/encodeframe sources, hostile parent rejected",()=>{
  const result=verifyVp9TokenPackedAudit(audit);assert.equal(result.sentinelWriterSites,2);assert.equal(result.reviewedCHeaderFiles,880);
  for(const file of Object.keys(preimages).slice(0,3))assert.throws(()=>makeVp9TokenPackedSources({...preimages,[file]:preimages[file]+" "}));
  const broken=structuredClone(audit);broken.sentinelReferences[1].matches.pop();assert.throws(()=>verifyVp9TokenPackedAudit(broken));
  const changed=structuredClone(audit);changed.preimages["vp9/common/vp9_entropy.h"].exactSource+=" ";assert.throws(()=>verifyVp9TokenPackedAudit(changed));
});
test("compiled original/packed producer-packer operations match with all field patterns and low/high bit depths",{timeout:120000},async()=>{
  const result=await runVp9TokenPackedCUnit(preimages);assert.deepEqual(result.variants.map(v=>v.candidateRecordBytes),[4,4,8,8]);
  assert.equal(result.variants.reduce((n,v)=>n+v.producerPackerCases,0),552960);
  assert.ok(result.variants.every(v=>v.extraBitPatterns===65536&&v.contextIndices===1024));
  assert.equal(result.actualMemorySavedBytes,null);assert.equal(result.nativeCodecConversion,false);assert.equal(result.publicAcceptance,false);
});
