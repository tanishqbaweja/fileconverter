// Decoder-only bounded plane policy atop the actual alignment16 build recipe.
import assert from "node:assert/strict";
import { makeAlignment16Recipe } from "./mpeg2-alignment16-recipe.mjs";
export function makeHevcPlaneRecipe(source) {
  const prior = makeAlignment16Recipe(source);
  const before = 'printf \'%s  %s\\n\' 910da6292a78066b114da7d26c7c1684969022960efc8becf116dc2b5acc4ab4 \\\n  ffmpeg/libavcodec/get_buffer.c | sha256sum --check --strict';
  const patch = `
node "\${SCRIPT_DIR}/patch-mpeg2-hevc-planes.mjs" "\${BUILD_ROOT}/ffmpeg/libavutil/buffer.c" "\${BUILD_ROOT}/ffmpeg/libavcodec/get_buffer.c"
cp "\${SCRIPT_DIR}/mpeg2-hevc-plane-policy.h" "\${BUILD_ROOT}/ffmpeg/libavcodec/mpeg2-hevc-plane-policy.h"
printf '%s  %s\\n' 76fcae1c9409074b9b287d77d189ba06ab84e680e818a7649c56a6ad43db081a ffmpeg/libavutil/buffer.c | sha256sum --check --strict
printf '%s  %s\\n' 79c74c197a61441287a0c8cb6e1a2703aadc1db0dc9f2625a2dd5a7f70b4f6e0 ffmpeg/libavcodec/get_buffer.c | sha256sum --check --strict
`;
  const marker = "# Compile the preserved production AVIO/kernel with the separate codec hooks.";
  const smoke = `emcc "\${BUILD_ROOT}/hevc-plane-smoke.c" "\${SCRIPT_DIR}/mpeg2-allocation-attempt.c" -I"\${PREFIX}/include" -I"\${SCRIPT_DIR}" \\
  "\${PREFIX}/lib/libavutil.a" -O2 -UNDEBUG -pthread -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc \\
  -sENVIRONMENT=node -sFILESYSTEM=0 -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sMODULARIZE=0 -sEXPORT_ES6=0 \\
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 -Wl,--wrap=posix_memalign \\
  -o "\${BUILD_ROOT}/hevc-plane-smoke.js"
node "\${BUILD_ROOT}/hevc-plane-smoke.js" > "\${OUTPUT_ROOT}/hevc-plane-smoke.json"
test -s "\${OUTPUT_ROOT}/hevc-plane-smoke.json"
cp ffmpeg/libavutil/buffer.c "\${OUTPUT_ROOT}/hevc-plane-buffer.c"
cp ffmpeg/libavcodec/get_buffer.c "\${OUTPUT_ROOT}/hevc-plane-get-buffer.c"
`;
  const edits = [[before, before + patch], [marker, smoke + marker]];
  let generated = prior;
  for (const [old, changed] of edits) { assert.equal(generated.split(old).length, 2); generated = generated.replace(old, changed); }
  let reverse = generated; for (const [old, changed] of edits.toReversed()) reverse = reverse.replace(changed, old);
  assert.equal(reverse, prior, "No decoder references, codec/I/O settings, fixed heaps or separate encoder bytes changed");
  return generated;
}
