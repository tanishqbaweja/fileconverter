import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {makeVp9TokenContextSources} from "../media/ffmpeg/vp9-token-context-recipe.mjs";
import {runVp9TokenContextCUnit} from "../media/ffmpeg/vp9-token-context-c-unit.mjs";
const audit=JSON.parse(await readFile(new URL("../evidence/2026-11-06-vp9-token-context-source-audit.json",import.meta.url))),
  preimages=Object.fromEntries(Object.entries(audit.preimages).map(([f,v])=>[f,v.exactSource]));
test("pointer-to-offset record candidate is exact reversible, preserves token capacity, never claims accepted savings",()=>{
  const candidate=makeVp9TokenContextSources(preimages);
  for(const [file,result] of Object.entries(candidate.sources)) {
    let reverse=result.generated;for(const [before,after] of result.edits.toReversed())reverse=reverse.replace(after,before);
    assert.equal(reverse,preimages[file]);assert.equal(createHash("sha256").update(reverse).digest("hex"),audit.preimages[file].sha256);
  }
  assert.equal(candidate.sources["vp9/encoder/vp9_tokenize.c"].edits.length,3);
  assert.equal(candidate.sources["vp9/encoder/vp9_bitstream.c"].edits.length,2);
  for(const flag of ["tokenCapacityChanged","codecSettingsChanged","pixelAlgorithmsChanged","memoryLimitsRaised","browserValidated","speedGainProven","publicAcceptance"])
    assert.equal(candidate[flag],false);
  assert.equal(candidate.actualMemorySavedBytes,null);
});
test("changed token-source parent fails closed",()=>{
  for(const file of Object.keys(preimages))assert.throws(()=>makeVp9TokenContextSources({...preimages,[file]:preimages[file]+" "}));
});
test("compiled producer/packer controls preserve counts, contexts, extras and entropy operations even after probability updates",{timeout:120000},async()=>{
  const result=await runVp9TokenContextCUnit();
  assert.deepEqual(result.variants.map(v=>v.producerPackerCases),[69120,207360]);
  assert.deepEqual(result.variants.map(v=>v.candidateRecordBytes),[6,8]);
  assert.equal(result.actualMemorySavedBytes,null);assert.equal(result.nativeCodecConversion,false);
  assert.equal(result.browserValidated,false);assert.equal(result.publicAcceptance,false);
});
