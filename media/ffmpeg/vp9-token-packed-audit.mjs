// Facts reviewed in an authenticated whole-archive inventory, not generic C proof.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
export const VP9_PACKED_EXTRA_PINS=Object.freeze({
  "vp9/encoder/vp9_encodeframe.c":"b72c663dfd940c8767905404c0e45f10cec2d07dfabdfadc036dbe61be84c31b",
  "vp9/common/vp9_entropy.h":"539027204da3777f748aa4b965f91bfb629c885a4a5c9bbc0a2eaa7546cc4cbc",
});
export function verifyVp9TokenPackedAudit(audit) {
  assert.equal(audit.archiveSha256,"7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c");assert.equal(audit.cFiles,880);
  for(const [file,pin]of Object.entries(VP9_PACKED_EXTRA_PINS))assert.equal(createHash("sha256").update(audit.preimages[file].exactSource).digest("hex"),pin);
  assert.deepEqual(audit.sentinelReferences.map(x=>[x.file,x.matches.map(m=>m.text)]),[
    ["vp9/encoder/vp9_bitstream.c",["for (p = *tp; p < stop && p->token != EOSB_TOKEN; ++p) {",
      "if (p == stop || p->token == EOSB_TOKEN) {","*tp = (TOKENEXTRA *)(uintptr_t)p + (p->token == EOSB_TOKEN);",
      "assert(t != EOSB_TOKEN);","*tp = (TOKENEXTRA *)(uintptr_t)p + (p->token == EOSB_TOKEN);"]],
    ["vp9/encoder/vp9_encodeframe.c",["(*tp)->token = EOSB_TOKEN;","(*tp)->token = EOSB_TOKEN;"]],
    ["vp9/encoder/vp9_tokenize.h",["#define EOSB_TOKEN 127  // Not signalled, encoder only"]],
  ]);
  assert.deepEqual(audit.references.map(x=>x.file),["vp9/encoder/vp9_bitstream.c","vp9/encoder/vp9_encodeframe.c",
    "vp9/encoder/vp9_encoder.h","vp9/encoder/vp9_tokenize.c","vp9/encoder/vp9_tokenize.h"]);
  const entropy=audit.preimages["vp9/common/vp9_entropy.h"].exactSource;
  const names=["ZERO","ONE","TWO","THREE","FOUR","CATEGORY1","CATEGORY2","CATEGORY3","CATEGORY4","CATEGORY5","CATEGORY6","EOB"];
  for(const [i,name]of names.entries())assert.match(entropy,new RegExp("^#define "+name+"_TOKEN "+i+"(?:\\s|$)","m"));
  assert.match(entropy,/^#define ENTROPY_TOKENS 12$/m);assert.match(entropy,/^#define UNCONSTRAINED_NODES 3$/m);
  return {sourceArchiveSha256:audit.archiveSha256,reviewedCHeaderFiles:880,tokenReferenceFiles:5,sentinelWriterSites:2,
    sentinelReadFunction:"pack_mb_tokens",sentinelIsNotEntropyIndexOrSignalled:true,entropyTokenValuesUnchanged:true,
    semanticProofForArbitrarySources:false,actualLinkedCodecValidated:false,publicAcceptance:false};
}
