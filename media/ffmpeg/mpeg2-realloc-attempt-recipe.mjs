// Add scalar wrappers and actual-library controls only. Old heaps/encoder/I/O
// and every qualified packet-cache control remain byte-exact on reversal.
import assert from "node:assert/strict";
import { makeLargestIdleRecipe } from "./mpeg2-packet-largest-idle-recipe.mjs";
export function makeReallocAttemptRecipe(source) {
  const prior = makeLargestIdleRecipe(source), edits = [];
  const marker = "# Compile the preserved production AVIO/kernel with the separate codec hooks.";
  const flags = "-Wl,--wrap=av_realloc -Wl,--wrap=av_buffer_realloc";
  const common = `  -O2 -Wall -Wextra -Werror -Wno-error=unused-command-line-argument -UNDEBUG -pthread \\
  -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc -sENVIRONMENT=node -sFILESYSTEM=0 \\
  -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sMODULARIZE=0 -sEXPORT_ES6=0 \\
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 \\
`;
  const smoke = `# Fixed scalar realloc diagnostic controls, not browser/full-original acceptance.
emcc "\${SCRIPT_DIR}/mpeg2-realloc-attempt-smoke.c" ${common}  -o "\${BUILD_ROOT}/realloc-attempt-smoke.js"
node "\${BUILD_ROOT}/realloc-attempt-smoke.js" > "\${OUTPUT_ROOT}/realloc-attempt-smoke.json"
emcc "\${SCRIPT_DIR}/mpeg2-realloc-avutil-smoke.c" "\${SCRIPT_DIR}/mpeg2-realloc-attempt.c" \\
  "\${SCRIPT_DIR}/mpeg2-allocation-attempt.c" -I"\${PREFIX}/include" -I"\${SCRIPT_DIR}" \\
  "\${PREFIX}/lib/libavutil.a" \\
${common}  ${flags} -Wl,--wrap=posix_memalign -o "\${BUILD_ROOT}/realloc-avutil-smoke.js"
node "\${BUILD_ROOT}/realloc-avutil-smoke.js" > "\${OUTPUT_ROOT}/realloc-avutil-smoke.json"
test -s "\${OUTPUT_ROOT}/realloc-attempt-smoke.json"
test -s "\${OUTPUT_ROOT}/realloc-avutil-smoke.json"
`;
  edits.push([marker, smoke + marker]);
  const command = 'emcc "${BUILD_ROOT}/within_split_pipeline.c" "${SCRIPT_DIR}/mpeg2-allocation-attempt.c"';
  edits.push([command, command + ' "${SCRIPT_DIR}/mpeg2-realloc-attempt.c"']);
  const linker = '-Wl,-Map,${OUTPUT_ROOT}/decoder-link.map -Wl,--wrap=posix_memalign -Wl,--no-entry';
  edits.push([linker, linker.replace(" -Wl,--no-entry", ` ${flags} -Wl,--no-entry`)]);
  let generated = prior;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reverse = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
  assert.equal(reverse, prior);
  return { generated, parent: prior, edits, diagnosticBytes: 64, publicAcceptance: false, failedOriginalRequestProven: false };
}
export const makeReallocAttemptShellRecipe = source => makeReallocAttemptRecipe(source).generated;
