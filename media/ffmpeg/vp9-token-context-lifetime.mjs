// Reviewed pinned-source facts, not a semantic/alias proof for arbitrary C.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
export const VP9_TOKEN_CONTEXT_LIFETIME_PINS=Object.freeze({
  "vp9/common/vp9_onyxc_int.h":"2c44a00c9c9f22e83be4835395a6692d30be18b049701bce49e2581289e0b060",
  "vp9/common/vp9_entropymode.h":"d3e9ac5ebb30f151b4ee71d4c85f23e30ecb596317dc76c4a6c66236fb83a5da",
  "vp9/common/vp9_entropy.h":"539027204da3777f748aa4b965f91bfb629c885a4a5c9bbc0a2eaa7546cc4cbc",
  "vp9/common/vp9_alloccommon.c":"f496640ea6344b71c0a193ddbc77eebafc3b7be2de3a4efc60d16c7d60e65e89",
  "vpx/internal/vpx_codec_internal.h":"592237daf5d4d6982731a7a4a6c73d10760825c29f5c3755720bf9985c116f7f",
  "vp9/encoder/vp9_encoder.h":"299ee992384604932584c959b9504130981a5562833863751100627022662f6c",
  "vp9/encoder/vp9_encoder.c":"c42b8ef0665831f40715eca748bf7cecfcc98dd212927bbfe042a355c6fc3faa",
  "vp9/encoder/vp9_tokenize.c":"909f28c30ce3aa58560e926d8d74a0872f51d45bae6625f7aa741b4e3a15d1bd",
  "vp9/encoder/vp9_bitstream.c":"211f57fbfeb815b3d871dd741aa9aa7570023878b86517f774ca2e3ca4ad9dcf",
});
export function verifyVp9TokenContextLifetime(sources,currentEncoder) {
  for(const [file,pin] of Object.entries(VP9_TOKEN_CONTEXT_LIFETIME_PINS))
    assert.equal(createHash("sha256").update(sources[file]??"").digest("hex"),pin,"Pinned context-lifetime source "+file);
  const encoder=sources["vp9/encoder/vp9_encoder.c"],macro=sources["vpx/internal/vpx_codec_internal.h"],
    common=sources["vp9/common/vp9_onyxc_int.h"],entropy=sources["vp9/common/vp9_entropy.h"],
    mode=sources["vp9/common/vp9_entropymode.h"],producer=sources["vp9/encoder/vp9_tokenize.c"],packer=sources["vp9/encoder/vp9_bitstream.c"];
  assert.ok(common.includes("FRAME_CONTEXT *fc;"));assert.ok(common.includes("xd->fc = cm->fc;"));
  assert.ok(mode.includes("vp9_coeff_probs_model coef_probs[TX_SIZES][PLANE_TYPES];"));
  for(const definition of ["#define REF_TYPES 2","#define COEF_BANDS 6","#define COEFF_CONTEXTS 6","#define UNCONSTRAINED_NODES 3"])
    assert.ok(entropy.includes(definition));
  assert.equal((macro.match(/\(lval\)\s*=\s*\(expr\)/g)??[]).length,2);
  const allocation="CHECK_MEM_ERROR(&cm->error, cm->fc,",zero=encoder.indexOf("vp9_zero(*cpi);");
  assert.equal(encoder.split(allocation).length,2);assert.ok(zero>0&&zero<encoder.indexOf(allocation));
  assert.ok(encoder.includes("(FRAME_CONTEXT *)vpx_calloc(1, sizeof(*cm->fc))"));
  const copies=encoder.split("\n").filter(line=>/cm->fc\s*=(?!=)/.test(line)).map(line=>line.trim());
  assert.deepEqual(copies,["*cm->fc = cm->frame_contexts[cm->frame_context_idx];","*cm->fc = cc->fc;"]);
  assert.ok(sources["vp9/common/vp9_alloccommon.c"].includes("vpx_free(cm->fc);\n  cm->fc = NULL;"));
  // Existing allocation-only private patches must not change the lifetime facts.
  const refs=source=>source.split("\n").filter(line=>/\bcm->fc\b|\bcpi->common\.fc\b|vp9_zero\(\*cpi\)/.test(line)).map(line=>line.trim());
  assert.deepEqual(refs(currentEncoder),refs(encoder));
  assert.equal((producer.match(/\(\*t\)->context_tree = context_tree;/g)??[]).length,2);
  assert.equal(producer.split("cpi->common.fc->coef_probs[tx_size][type][ref]").length,2);
  assert.equal(packer.split("pack_mb_tokens(w, tok, tok_end, cm->bit_depth);").length,2);
  return {sourcePins:VP9_TOKEN_CONTEXT_LIFETIME_PINS,encoderAllocationBeforeTokenization:true,
    encoderFrameContextWritesAreObjectCopies:true,probabilityContentsMayChangeBeforePacking:true,
    sameLiveTableUsedByProducerAndPacker:true,existingPrivateAllocationPatchesPreserveContextReferences:true,
    reviewedPinnedSourcesOnly:true,semanticProofForArbitrarySources:false,publicAcceptance:false};
}
