// PRIVATE internal record representation only; no token budget or codec changes.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
const sha=s=>createHash("sha256").update(s).digest("hex");
export const VP9_TOKEN_CONTEXT_PINS=Object.freeze({
  "vp9/encoder/vp9_tokenize.h":"5942c93a8f07fc7e5f2b479954ec77c3672294816f3bf6d168d65fee9d40d6a7",
  "vp9/encoder/vp9_tokenize.c":"909f28c30ce3aa58560e926d8d74a0872f51d45bae6625f7aa741b4e3a15d1bd",
  "vp9/encoder/vp9_bitstream.c":"211f57fbfeb815b3d871dd741aa9aa7570023878b86517f774ca2e3ca4ad9dcf",
});
export function extractVp9TokenFunction(source,signature) {
  const start=source.indexOf(signature),end=source.indexOf("\n}\n",start);
  assert.ok(start>0&&end>start);assert.equal(source.indexOf(signature,start+1),-1);
  return source.slice(start,end+3);
}
export function makeVp9TokenContextSources(preimages) {
  const sources={};for(const [file,pin] of Object.entries(VP9_TOKEN_CONTEXT_PINS)) {
    assert.equal(sha(preimages[file]),pin,"Exact token-context parent "+file);sources[file]=preimages[file];
  }
  const header="vp9/encoder/vp9_tokenize.h",producer="vp9/encoder/vp9_tokenize.c",packer="vp9/encoder/vp9_bitstream.c",edits={};
  const replace=(file,before,after)=>{
    assert.equal(sources[file].split(before).length,2);sources[file]=sources[file].replace(before,after);
    (edits[file]??=[]).push([before,after]);
  };
  replace(header,"  const vpx_prob *context_tree;\n  int16_t token;\n  EXTRABIT extra;\n} TOKENEXTRA;",
    "  uint16_t context_tree_offset;\n  int16_t token;\n  EXTRABIT extra;\n} TOKENEXTRA;");
  for(const name of ["add_token","add_token_no_extra"]) {
    const original=extractVp9TokenFunction(sources[producer],"static INLINE void "+name+"(");
    let generated=original.replace("unsigned int *counts) {","unsigned int *counts,\n                             const unsigned char *context_base) {");
    assert.notEqual(generated,original);
    generated=generated.replace("  (*t)->context_tree = context_tree;",
      "  const size_t offset = (const unsigned char *)context_tree - context_base;\n"+
      "  assert(sizeof(((FRAME_CONTEXT *)0)->coef_probs) <= 65536);\n"+
      "  assert(offset <= sizeof(((FRAME_CONTEXT *)0)->coef_probs) - UNCONSTRAINED_NODES);\n"+
      "  (*t)->context_tree_offset = (uint16_t)offset;");
    assert.notEqual(generated,original);replace(producer,original,generated);
  }
  const tokenize=extractVp9TokenFunction(sources[producer],"static void tokenize_b(");
  assert.equal(tokenize.split("counts[band[c]][pt]);").length,4);
  const changedTokenize=tokenize.replace("  VP9_COMP *cpi = args->cpi;",
    "  VP9_COMP *cpi = args->cpi;\n"+
    "  const unsigned char *const context_base =\n"+
    "      (const unsigned char *)&cpi->common.fc->coef_probs;\n"+
    "  typedef char WithinTokenContextFits[\n"+
    "      sizeof(cpi->common.fc->coef_probs) <= 65536 ? 1 : -1];\n"+
    "  (void)sizeof(WithinTokenContextFits);")
    .replaceAll("counts[band[c]][pt]);","counts[band[c]][pt], context_base);");
  replace(producer,tokenize,changedTokenize);
  const pack=extractVp9TokenFunction(sources[packer],"static void pack_mb_tokens(");
  assert.equal(pack.split("p->context_tree").length,5);
  const changedPack=pack.replace("vpx_bit_depth_t bit_depth) {",
    "vpx_bit_depth_t bit_depth,\n                           const unsigned char *context_base) {")
    .replaceAll("p->context_tree","(context_base + p->context_tree_offset)");
  replace(packer,pack,changedPack);
  replace(packer,"  pack_mb_tokens(w, tok, tok_end, cm->bit_depth);",
    "  pack_mb_tokens(w, tok, tok_end, cm->bit_depth,\n"+
    "                 (const unsigned char *)&cm->fc->coef_probs);");
  const results={};
  for(const [file,generated] of Object.entries(sources)) {
    let reverse=generated;for(const [before,after] of edits[file].toReversed()) {
      assert.equal(reverse.split(after).length,2);reverse=reverse.replace(after,before);
    }
    assert.equal(reverse,preimages[file]);
    results[file]={generated,edits:edits[file],parentSha256:sha(preimages[file]),generatedSha256:sha(generated)};
  }
  return {sources:results,scope:"Private pointer-to-offset token record candidate, NOT a compiled Wasm/browser optimization acceptance",
    tokenCapacityChanged:false,codecSettingsChanged:false,pixelAlgorithmsChanged:false,memoryLimitsRaised:false,
    actualMemorySavedBytes:null,browserValidated:false,speedGainProven:false,publicAcceptance:false};
}
