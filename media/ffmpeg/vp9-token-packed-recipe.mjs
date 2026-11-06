// Private record representation only. No token-capacity/entropy/settings change.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {makeVp9TokenContextSources} from "./vp9-token-context-recipe.mjs";
const sha=s=>createHash("sha256").update(s).digest("hex");
export function makeVp9TokenPackedSources(preimages) {
  const parent=makeVp9TokenContextSources(preimages),sources=Object.fromEntries(Object.entries(parent.sources).map(([f,v])=>[f,v.generated])),edits={};
  const header="vp9/encoder/vp9_tokenize.h",producer="vp9/encoder/vp9_tokenize.c",packer="vp9/encoder/vp9_bitstream.c";
  const replace=(file,before,after)=>{assert.equal(sources[file].split(before).length,2,before.slice(0,128));sources[file]=sources[file].replace(before,after);(edits[file]??=[]).push([before,after]);};
  // EOSB is internal and never indexed as an entropy token or signalled on wire.
  // A pinned complete-source sentinel audit is required by the build integration.
  replace(header,"#define EOSB_TOKEN 127  // Not signalled, encoder only","#define EOSB_TOKEN 15  // Not signalled, encoder only; private packed sentinel");
  replace(header,"  uint16_t context_tree_offset;\n  int16_t token;\n  EXTRABIT extra;\n} TOKENEXTRA;",
    "  uint16_t context_tree_index : 10;\n  uint16_t token : 4;\n  EXTRABIT extra;\n} TOKENEXTRA;\n"+
    "typedef char WithinPackedTokenSize[\n"+
    "    sizeof(TOKENEXTRA) == (CONFIG_VP9_HIGHBITDEPTH ? 8 : 4) ? 1 : -1];\n"+
    "typedef char WithinPackedTokenDomain[\n"+
    "    ENTROPY_TOKENS == 12 && EOB_TOKEN == 11 && EOSB_TOKEN == 15 ? 1 : -1];");
  const old="  assert(sizeof(((FRAME_CONTEXT *)0)->coef_probs) <= 65536);\n"+
    "  assert(offset <= sizeof(((FRAME_CONTEXT *)0)->coef_probs) - UNCONSTRAINED_NODES);\n"+
    "  (*t)->context_tree_offset = (uint16_t)offset;";
  const changed="  assert(UNCONSTRAINED_NODES == 3);\n"+
    "  assert(sizeof(((FRAME_CONTEXT *)0)->coef_probs) <= 1024 * UNCONSTRAINED_NODES);\n"+
    "  assert(offset <= sizeof(((FRAME_CONTEXT *)0)->coef_probs) - UNCONSTRAINED_NODES);\n"+
    "  assert(offset % UNCONSTRAINED_NODES == 0);\n"+
    "  assert(token >= ZERO_TOKEN && token < ENTROPY_TOKENS);\n"+
    "  (*t)->context_tree_index = (uint16_t)(offset / UNCONSTRAINED_NODES);";
  assert.equal(sources[producer].split(old).length,3);
  // Separate exact function replacements remain reversible despite shared bodies.
  for(const name of ["add_token","add_token_no_extra"]) {
    const start=sources[producer].indexOf("static INLINE void "+name+"("),end=sources[producer].indexOf("\n}\n",start);
    assert.ok(start>0&&end>start);const before=sources[producer].slice(start,end+3);assert.ok(before.includes(old));replace(producer,before,before.replace(old,changed));
  }
  replace(producer,"      sizeof(cpi->common.fc->coef_probs) <= 65536 ? 1 : -1];",
    "      UNCONSTRAINED_NODES == 3 &&\n      sizeof(cpi->common.fc->coef_probs) <= 1024 * UNCONSTRAINED_NODES ? 1 : -1];");
  assert.equal(sources[packer].split("(context_base + p->context_tree_offset)").length,5);
  const start=sources[packer].indexOf("static void pack_mb_tokens("),end=sources[packer].indexOf("\n}\n",start),before=sources[packer].slice(start,end+3);
  replace(packer,before,before.replaceAll("(context_base + p->context_tree_offset)","(context_base + p->context_tree_index * UNCONSTRAINED_NODES)"));
  const results={};
  for(const [file,generated]of Object.entries(sources)) {
    let reverse=generated;for(const [before,after]of edits[file].toReversed()){assert.equal(reverse.split(after).length,2);reverse=reverse.replace(after,before);}
    assert.equal(reverse,parent.sources[file].generated);
    results[file]={generated,edits:edits[file],parentSha256:sha(reverse),generatedSha256:sha(generated)};
  }
  return {sources:results,parentContextSources:parent.sources,scope:"Private context-index/token-bitfield representation candidate, NOT linked codec/browser acceptance",
    internalSentinel:{old:127,candidate:15,signalled:false},tokenCapacityChanged:false,entropyTokenValuesChanged:false,
    extraBitsChanged:false,codecSettingsChanged:false,pixelAlgorithmsChanged:false,memoryLimitsRaised:false,
    actualMemorySavedBytes:null,browserValidated:false,speedGainProven:false,publicAcceptance:false};
}
