// Private configuration-only CPU decode candidate. Published recipes stay exact.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const VPX_BASE_LIBRARIES_SHA256 = "6414ea37233cf82ebb4cbac2352061ed830befbdf7eb395988b7c1e2d187f6cf";
export const VPX_BASE_RECIPE_SHA256 = "6323620da9f7046d440aac362cd3211f21e4e19a679cd3c4b2f09182cb457f5e";
export const VPX_COMPILED_WRAPPER_SHA256 = "ff8926c995010617bcc76701f0ea75feb5a2c99dadb136d8b8d1c8703e5d6dcd";
const sha = value => createHash("sha256").update(value).digest("hex");
function exact(source, edits) {
  let generated = source;
  for (const [before, after] of edits) { assert.equal(generated.split(before).length, 2); generated = generated.replace(before, after); }
  let reverse = generated;
  for (const [before, after] of edits.toReversed()) { assert.equal(reverse.split(after).length, 2); reverse = reverse.replace(after, before); }
  assert.equal(reverse, source);
  return { generated, generatedSha256: sha(generated), edits, publicAcceptance: false };
}
export function makeVpxDecoderLibraries(source) {
  assert.equal(sha(source), VPX_BASE_LIBRARIES_SHA256);
  const decoders = "--enable-decoder=aac,alac,amrnb,amrwb,flac,h264,hevc,mp3,mpeg2video,mpeg4,opus,pcm_s16be,pcm_s16le,theora,vorbis,wmav1,wmav2";
  const parsers = "ENABLED_PARSERS=aac,flac,h264,hevc,mpeg4video,mpegaudio,mpegvideo,opus,vorbis";
  return exact(source, [[decoders, decoders + ",vp8,vp9"], [parsers, parsers + ",vp8,vp9"]]);
}
export function makeVpxDecoderBuildRecipe(source) {
  assert.equal(sha(source), VPX_BASE_RECIPE_SHA256);
  const start = source.indexOf("comparison_files=()\n"); assert.ok(start > 0);
  const tail = source.slice(start); assert.ok(tail.endsWith("printf 'Exact non-Docker FFmpeg artifact comparison passed.\\n'\n"));
  const configure = 'patch --directory="${BUILD_ROOT}/ffmpeg" --strip=1 < amr-bounded-packets.patch\n./build-libraries.sh\n';
  const link = "  WITHIN_BUILD_CORE_FILTER=within-remux ./build-remux.sh\n";
  return exact(source, [
    ['SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"', 'SCRIPT_DIR="${WITHIN_VPX_DECODER_SCRIPT_DIR:?Explicit repository source directory required}"'],
    ['KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"', 'KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"\n[[ "${WITHIN_BUILD_CORE_FILTER:-}" == "within-remux" && "${KEEP_OUTPUT}" == "1" ]] || exit 2'],
    [configure, 'patch --directory="${BUILD_ROOT}/ffmpeg" --strip=1 < amr-bounded-packets.patch\n' +
      'node "${SCRIPT_DIR}/make-vpx-decoder-candidate.mjs" "${BUILD_ROOT}/build-libraries.sh" "${BUILD_ROOT}/build-libraries.vpx.sh"\n' +
      'bash "${BUILD_ROOT}/build-libraries.vpx.sh"\n'],
    [link, link + '  cp -- "${BUILD_ROOT}/within_remux.c" "${OUTPUT_ROOT}/within_remux.vpx.c"\n' +
      '  cp -- "${BUILD_ROOT}/build-libraries.sh" "${OUTPUT_ROOT}/build-libraries.base.sh"\n' +
      '  cp -- "${BUILD_ROOT}/build-libraries.vpx.sh" "${OUTPUT_ROOT}/build-libraries.vpx.sh"\n' +
      '  cp -- "${BUILD_ROOT}/ffmpeg/config_components.h" "${OUTPUT_ROOT}/config_components.h"\n'],
    [tail, "# Changed decoder availability, never public artifact reproduction/promotion.\nprintf 'Private VP8/VP9 CPU decoder candidate compiled; browser and memory gates pending.\\n'\n"],
  ]);
}
export function verifyVpxDecoderComponents(source) {
  for (const name of ["VP8_DECODER", "VP9_DECODER", "VP8_PARSER", "VP9_PARSER"]) {
    const match = source.match(new RegExp("^#define CONFIG_" + name + " ([01])$", "m"));
    assert.equal(match?.[1], "1", "Actual compiled FFmpeg component missing: " + name);
  }
  for (const name of ["LIBVPX_VP8_DECODER", "LIBVPX_VP9_DECODER", "AV1_DECODER", "LIBDAV1D_DECODER", "LIBAOM_AV1_DECODER"]) {
    const match = source.match(new RegExp("^#define CONFIG_" + name + " ([01])$", "m"));
    assert.equal(match?.[1], "0", "Do not invent AV1 coverage or enable undeclared external decoders: " + name);
  }
  return { addedSoftwareDecoders: ["vp8", "vp9"], addedParsers: ["vp8", "vp9"], av1Implemented: false, publicAcceptance: false };
}
