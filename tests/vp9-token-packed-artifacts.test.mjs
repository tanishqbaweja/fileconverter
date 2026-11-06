// Mock artifact-authentication faults only; not a linked or accepted codec.
import assert from "node:assert/strict";
import {test} from "node:test";
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {makeVp9TokenPackedSources} from "../media/ffmpeg/vp9-token-packed-recipe.mjs";
import {authenticateVp9PackedArtifacts,VP9_PACKED_ARTIFACTS} from "../media/ffmpeg/vp9-token-packed-artifacts.mjs";
import {verifyVp9TokenPackedAudit,VP9_PACKED_EXTRA_PINS} from "../media/ffmpeg/vp9-token-packed-audit.mjs";
const auditBytes=await readFile(new URL("../evidence/2026-11-06-vp9-token-packed-source-audit.json",import.meta.url)),audit=JSON.parse(auditBytes),
  preimages=Object.fromEntries(Object.entries(audit.preimages).map(([f,v])=>[f,v.exactSource])),sha=s=>createHash("sha256").update(s).digest("hex");
function mockArtifacts(high=0) {
  const candidate=makeVp9TokenPackedSources(preimages),config="#define CONFIG_VP9_HIGHBITDEPTH "+high+"\n",c="mock probe source",llvm='target triple = "wasm32-unknown-emscripten"\n'+
    "@within_previous_token_bytes = global i32 "+(high?8:6)+", align 4\n@within_packed_token_bytes = global i32 "+(high?8:4)+", align 4\n@within_packed_highbitdepth = global i32 "+high+", align 4\n",
    proof={...candidate,reviewedDomain:verifyVp9TokenPackedAudit(audit),sourceAuditSha256:sha(auditBytes),actualVendorExtraPins:VP9_PACKED_EXTRA_PINS,
      cUnit:{variants:[0,0,1,1].map((highBitDepth,i)=>({highBitDepth,optimization:i%2?"-O2":"-O0",producerPackerCases:highBitDepth?207360:69120,
        candidateRecordBytes:highBitDepth?8:4,extraBitPatterns:65536,contextIndices:1024}))},
      layout:{highBitDepth:high,previousRecordBytes:high?8:6,packedRecordBytes:high?8:4,extraOffset:high?4:2,
        actualLibraryConfiguration:true,codecInstantiated:false,vpxConfigSha256:sha(config),cSourceSha256:sha(c),llvmSha256:sha(llvm)}},
    files={"vp9_tokenize.header.packed.c":candidate.sources["vp9/encoder/vp9_tokenize.h"].generated,
      "vp9_tokenize.producer.packed.c":candidate.sources["vp9/encoder/vp9_tokenize.c"].generated,
      "vp9_bitstream.packer.packed.c":candidate.sources["vp9/encoder/vp9_bitstream.c"].generated,
      "vp9-packed-vpx-config.h":config,"vp9-packed-layout-probe.c":c,"vp9-packed-layout-probe.ll":llvm};
  return {proof,files,read:async file=>Buffer.from(file==="vp9-token-packed-proof.json"?JSON.stringify(proof):files[file])};
}
test("mock collector/builder auth binds final packed sources and actual configured layout, not ancestor record size",async()=>{
  for(const high of [0,1]) {
    const m=mockArtifacts(high),r=await authenticateVp9PackedArtifacts(m.read,preimages);
    assert.equal(r.layout.packedRecordBytes,high?8:4);assert.equal(r.layout.previousRecordBytes,high?8:6);
    assert.equal(r.actualMemorySavedBytes,null);assert.equal(r.browserValidated,false);assert.equal(r.publicAcceptance,false);
    assert.equal(r.producerPackerCases,552960);assert.equal(VP9_PACKED_ARTIFACTS.length,7);
  }
});
test("mock auth rejects changed final sources, header config, probe source and LLVM rather than accepting parent evidence",async()=>{
  for(const file of ["vp9_tokenize.header.packed.c","vp9_tokenize.producer.packed.c","vp9_bitstream.packer.packed.c",
    "vp9-packed-vpx-config.h","vp9-packed-layout-probe.c","vp9-packed-layout-probe.ll"]) {
    const m=mockArtifacts();m.files[file]+="changed";await assert.rejects(authenticateVp9PackedArtifacts(m.read,preimages));
  }
});
test("fflate Uint8Array members authenticate identically to filesystem Buffers, never numeric-string coercion",async()=>{
  const m=mockArtifacts(),expected=await authenticateVp9PackedArtifacts(m.read,preimages),
    actual=await authenticateVp9PackedArtifacts(async file=>new Uint8Array(await m.read(file)),preimages);
  assert.deepEqual(actual,expected);
  await assert.rejects(authenticateVp9PackedArtifacts(async()=>new Uint8Array(2097153),preimages));
  await assert.rejects(authenticateVp9PackedArtifacts(async()=>"not bytes",preimages));
});
test("mock auth rejects missing layout, wrong record, false validation claims and incomplete entropy controls",async()=>{
  for(const mutate of [p=>p.layout=null,p=>p.layout.packedRecordBytes=6,p=>p.layout.actualLibraryConfiguration=false,
    p=>p.actualMemorySavedBytes=100,p=>p.browserValidated=true,p=>p.cUnit.variants[0].producerPackerCases=0,
    p=>p.cUnit.variants[0].extraBitPatterns=0,p=>p.internalSentinel.signalled=true]) {
    const m=mockArtifacts();mutate(m.proof);await assert.rejects(authenticateVp9PackedArtifacts(m.read,preimages));
  }
});
