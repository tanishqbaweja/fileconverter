// Add only a scalar failure slot around the exact original allocation dispatch.
import assert from "node:assert/strict";
import { makeSingleIdleRecipe } from "./mpeg2-single-idle-recipe.mjs";
export function makeAllocationAttemptRecipe(source) {
  const prior = makeSingleIdleRecipe(source);
  const before = '"${SCRIPT_DIR}/mpeg2-aligned-reuse.c"';
  const after = '"${SCRIPT_DIR}/mpeg2-allocation-attempt.c"';
  assert.equal(prior.split(before).length, 3);
  const unit = `# Synthetic actual-Wasm scalar-slot dispatch, not media/fidelity/memory acceptance.
emcc "\${SCRIPT_DIR}/mpeg2-allocation-attempt-smoke.c" -O2 -UNDEBUG -pthread \\
  -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc -sENVIRONMENT=node -sFILESYSTEM=0 \\
  -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sMODULARIZE=0 -sEXPORT_ES6=0 \\
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 \\
  -o "\${BUILD_ROOT}/allocation-attempt-smoke.js"
node "\${BUILD_ROOT}/allocation-attempt-smoke.js" > "\${OUTPUT_ROOT}/allocation-attempt-smoke.json"
test -s "\${OUTPUT_ROOT}/allocation-attempt-smoke.json"
`;
  const boundary = "# Compile the preserved production AVIO/kernel with the separate codec hooks.";
  assert.equal(prior.split(boundary).length, 2);
  const generated = prior.replaceAll(before, after).replace(boundary, unit + boundary);
  assert.equal(generated.replace(unit, "").replaceAll(after, before), prior);
  return generated;
}
