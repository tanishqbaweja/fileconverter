import assert from "node:assert/strict";
import { makeAllocationAttemptRecipe } from "./mpeg2-allocation-attempt-recipe.mjs";
export function makeAlignment16Recipe(source) {
  const prior = makeAllocationAttemptRecipe(source);
  const encoder = 'bash "${SCRIPT_DIR}/build-mpeg2-split-encoder.sh"';
  assert.equal(prior.split(encoder).length, 2);
  const smoke = `# Real Wasm allocator contract; no media or primary-memory acceptance.
emcc "\${SCRIPT_DIR}/mpeg2-alignment16-smoke.c" "\${SCRIPT_DIR}/mpeg2-allocation-attempt.c" -O2 -UNDEBUG -pthread \\
  -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc -sENVIRONMENT=node -sFILESYSTEM=0 \\
  -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sMODULARIZE=0 -sEXPORT_ES6=0 \\
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 \\
  -Wl,--wrap=posix_memalign -o "\${BUILD_ROOT}/alignment16-smoke.js"
node "\${BUILD_ROOT}/alignment16-smoke.js" > "\${OUTPUT_ROOT}/alignment16-smoke.json"
test -s "\${OUTPUT_ROOT}/alignment16-smoke.json"
`;
  const boundary = "# Compile the preserved production AVIO/kernel with the separate codec hooks.";
  assert.equal(prior.split(boundary).length, 2);
  const restore = 'node "${SCRIPT_DIR}/mpeg2-alignment16-sdk.mjs" restore "${WITHIN_ALIGNMENT16_SDK_STATE:?}"\n';
  const generated = prior.replace(boundary, smoke + boundary).replace(encoder, restore + encoder);
  assert.equal(generated.replace(smoke, "").replace(restore, ""), prior,
    "Only real allocator contract and pre-encoder SDK restoration added; buffers, heaps, codecs, AVIO, lifetimes unchanged");
  return generated;
}
