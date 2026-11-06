// Same bounded, read-only authentication used by builder and artifact collector.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {makeVp9TokenPackedSources} from "./vp9-token-packed-recipe.mjs";
import {VP9_PACKED_EXTRA_PINS} from "./vp9-token-packed-audit.mjs";
const sha=s=>createHash("sha256").update(s).digest("hex");
export const VP9_PACKED_ARTIFACTS=Object.freeze(["vp9_tokenize.header.packed.c","vp9_tokenize.producer.packed.c","vp9_bitstream.packer.packed.c",
  "vp9-token-packed-proof.json","vp9-packed-vpx-config.h","vp9-packed-layout-probe.c","vp9-packed-layout-probe.ll"]);
export async function authenticateVp9PackedArtifacts(readArtifact,preimages) {
  const derived=makeVp9TokenPackedSources(preimages),proof=JSON.parse(await readArtifact("vp9-token-packed-proof.json")),sourceSha256s={},
    stems={"vp9/encoder/vp9_tokenize.h":"vp9_tokenize.header","vp9/encoder/vp9_tokenize.c":"vp9_tokenize.producer","vp9/encoder/vp9_bitstream.c":"vp9_bitstream.packer"};
  for(const [file,row]of Object.entries(derived.sources)) {
    assert.equal((await readArtifact(stems[file]+".packed.c")).toString(),row.generated);
    assert.deepEqual(proof.sources[file].edits,row.edits);assert.equal(proof.sources[file].generatedSha256,row.generatedSha256);
    assert.equal(proof.parentContextSources[file].generatedSha256,derived.parentContextSources[file].generatedSha256);
    sourceSha256s[file]=row.generatedSha256;
  }
  assert.deepEqual(proof.internalSentinel,{old:127,candidate:15,signalled:false});assert.deepEqual(proof.actualVendorExtraPins,VP9_PACKED_EXTRA_PINS);
  assert.equal(proof.reviewedDomain.sentinelWriterSites,2);assert.equal(proof.reviewedDomain.reviewedCHeaderFiles,880);
  assert.deepEqual(proof.cUnit.variants.map(v=>v.producerPackerCases),[69120,69120,207360,207360]);
  assert.deepEqual(proof.cUnit.variants.map(v=>v.candidateRecordBytes),[4,4,8,8]);
  assert.deepEqual(proof.cUnit.variants.map(v=>v.optimization),["-O0","-O2","-O0","-O2"]);
  assert.ok(proof.cUnit.variants.every(v=>v.extraBitPatterns===65536&&v.contextIndices===1024));
  const config=(await readArtifact("vp9-packed-vpx-config.h")).toString(),match=config.match(/^#define CONFIG_VP9_HIGHBITDEPTH ([01])$/m);assert.ok(match);
  const high=Number(match[1]),llvm=(await readArtifact("vp9-packed-layout-probe.ll")).toString();
  assert.equal(proof.layout.highBitDepth,high);assert.equal(proof.layout.actualLibraryConfiguration,true);assert.equal(proof.layout.codecInstantiated,false);
  assert.equal(proof.layout.previousRecordBytes,high?8:6);assert.equal(proof.layout.packedRecordBytes,high?8:4);assert.equal(proof.layout.extraOffset,high?4:2);
  assert.equal(proof.layout.vpxConfigSha256,sha(config));assert.equal(proof.layout.llvmSha256,sha(llvm));
  assert.equal(proof.layout.cSourceSha256,sha(await readArtifact("vp9-packed-layout-probe.c")));
  assert.match(llvm,/target triple = "wasm32-unknown-emscripten"/);
  for(const [symbol,value]of [["within_previous_token_bytes",high?8:6],["within_packed_token_bytes",high?8:4],["within_packed_highbitdepth",high]])
    assert.match(llvm,new RegExp("@"+symbol+" = .*i32 "+value+","));
  for(const key of ["tokenCapacityChanged","entropyTokenValuesChanged","extraBitsChanged","codecSettingsChanged","pixelAlgorithmsChanged","memoryLimitsRaised","browserValidated","publicAcceptance"])assert.equal(proof[key],false);
  assert.equal(proof.actualMemorySavedBytes,null);
  return {sourceSha256s,layout:proof.layout,reviewedDomain:proof.reviewedDomain,sourceAuditSha256:proof.sourceAuditSha256,
    actualVendorExtraPins:proof.actualVendorExtraPins,producerPackerCases:552960,internalSentinel:proof.internalSentinel,
    tokenCapacityChanged:false,entropyTokenValuesChanged:false,extraBitsChanged:false,codecSettingsChanged:false,pixelAlgorithmsChanged:false,
    actualMemorySavedBytes:null,browserValidated:false,publicAcceptance:false};
}
