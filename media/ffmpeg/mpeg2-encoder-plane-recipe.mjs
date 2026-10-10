// Exact private derivative; original encoder recipe and published modules untouched.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const BASE_ENCODER_RECIPE_SHA256 = "200ec267d8b00a664911abf535e278b59bd6beed0568634ff7475aa8b603dc9c";
export function makeSingleIdleEncoderPlaneRecipe(source) {
  assert.equal(createHash("sha256").update(source).digest("hex"), BASE_ENCODER_RECIPE_SHA256);
  const apply = 'node "${SCRIPT_DIR}/patch-mpeg2-encoder-planes.mjs" "${FFMPEG_ROOT}/libavutil/buffer.c" "${FFMPEG_ROOT}/libavcodec/get_buffer.c"\n' +
    'cp "${SCRIPT_DIR}/mpeg2-encoder-plane-policy.h" "${FFMPEG_ROOT}/libavcodec/"\n' +
    'node "${SCRIPT_DIR}/patch-mpeg2-encoder-plane-prototype.mjs" "${FFMPEG_ROOT}/libavutil/buffer.c"\n';
  const smoke = `emcc "\${SCRIPT_DIR}/mpeg2-encoder-plane-smoke.c" -I"\${FFMPEG_ROOT}" -I"\${SCRIPT_DIR}" "\${FFMPEG_ROOT}/libavutil/libavutil.a" \\
  -O2 -UNDEBUG -pthread -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc -sENVIRONMENT=node -sFILESYSTEM=0 \\
  -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=16777216 \\
  -o "\${BUILD_ROOT}/encoder-plane-smoke.js"
node "\${BUILD_ROOT}/encoder-plane-smoke.js" > "\${OUTPUT_ROOT}/encoder-plane-smoke.json"
test -s "\${OUTPUT_ROOT}/encoder-plane-smoke.json"
cp "\${FFMPEG_ROOT}/libavutil/buffer.c" "\${OUTPUT_ROOT}/encoder-plane-buffer.c"
cp "\${FFMPEG_ROOT}/libavcodec/get_buffer.c" "\${OUTPUT_ROOT}/encoder-plane-get-buffer.c"
cp "\${SCRIPT_DIR}/mpeg2-encoder-plane-policy.h" "\${OUTPUT_ROOT}/encoder-plane-policy.h"
`;
  const edits = [
    ['SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"', 'SCRIPT_DIR="${WITHIN_ENCODER_PLANE_SCRIPT_DIR:?Private source directory required}"'],
    ['for source_check in \\\n  \'62a73fe537318e4706f25904022d071e8f8ef9535b5334bf5c7b650e572c0478 libavcodec/get_buffer.c\'',
      apply + 'for source_check in \\\n  \'76fcae1c9409074b9b287d77d189ba06ab84e680e818a7649c56a6ad43db081a libavutil/buffer.c\' \\\n  \'bb93754bc4f830df6d55043a6231992a3d34e1f75e6b556734d989560aba489f libavcodec/get_buffer.c\''],
    ['emcc "${SCRIPT_DIR}/mpeg2-split-encoder.c" -I"${FFMPEG_ROOT}"', smoke + 'emcc "${SCRIPT_DIR}/mpeg2-split-encoder.c" -I"${FFMPEG_ROOT}"'],
  ];
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let restored = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(restored.split(after).length, 2); restored = restored.replace(after, before); }
  assert.equal(restored, source);
  assert.ok(!generated.includes("docker ")); return { generated, edits };
}
