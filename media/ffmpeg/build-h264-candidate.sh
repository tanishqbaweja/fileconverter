#!/usr/bin/env bash
set -euo pipefail
case "${WITHIN_H264_MEMORY_MIB:-64}" in
  32) H264_FIXED_MEMORY_BYTES=33554432 ;;
  64) H264_FIXED_MEMORY_BYTES=67108864 ;;
  *) printf 'Private H264 fixed memory must be 32 or 64 MiB.\n' >&2; exit 2 ;;
esac
export WITHIN_H264_MEMORY_MIB="${WITHIN_H264_MEMORY_MIB:-64}"
case "${WITHIN_H264_LIBRARY_LTO:-0}" in
  0) H264_LIBRARY_LTO_FLAGS= ;;
  1) H264_LIBRARY_LTO_FLAGS=-flto ;;
  *) printf 'Private H264 library LTO must be 0 or 1.\n' >&2; exit 2 ;;
esac
export WITHIN_H264_LIBRARY_LTO="${WITHIN_H264_LIBRARY_LTO:-0}"
case "${WITHIN_H264_VAA_SIMD:-0}" in
  0|1) ;;
  *) printf 'Private H264 VAA SIMD must be 0 or 1.\n' >&2; exit 2 ;;
esac
export WITHIN_H264_VAA_SIMD="${WITHIN_H264_VAA_SIMD:-0}"

# Experimental artifacts only; never writes public/engines or existing cores.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORK_ROOT="${PROJECT_ROOT}/work"
BUILD_ROOT="${WORK_ROOT}/h264-candidate-build"
OUTPUT_ROOT="${WORK_ROOT}/h264-candidate-output"
[[ "$(uname -s)" == Linux ]] || { echo 'An activated Linux Emscripten SDK is required (no Docker).' >&2; exit 1; }
for command_name in emcc em++ emconfigure emmake emar emranlib emnm curl tar sha256sum make pkg-config node patch; do
  command -v "${command_name}" >/dev/null
done
[[ "$(emcc --version | head -1)" == *'6.0.4'* ]] || { echo 'Emscripten must be 6.0.4.' >&2; exit 1; }
[[ ! -e "${BUILD_ROOT}" && ! -e "${OUTPUT_ROOT}" ]] || { echo 'Candidate directories already exist.' >&2; exit 1; }
mkdir -p "${WORK_ROOT}"
available_kib="$(df -Pk "${WORK_ROOT}" | awk 'NR == 2 { print $4 }')"
[[ "${available_kib}" =~ ^[0-9]+$ ]] && (( available_kib >= 8388608 )) ||
  { echo 'Candidate build requires at least 8 GiB free.' >&2; exit 1; }
mkdir -p "${BUILD_ROOT}" "${OUTPUT_ROOT}"
cleanup() {
  local status=$?
  [[ "${BUILD_ROOT}" == "${PROJECT_ROOT}/work/h264-candidate-build" ]] || exit 2
  rm -rf -- "${BUILD_ROOT}"
  if [[ "${WITHIN_KEEP_H264_CANDIDATE:-0}" != 1 ]]; then
    [[ "${OUTPUT_ROOT}" == "${PROJECT_ROOT}/work/h264-candidate-output" ]] || exit 2
    rm -rf -- "${OUTPUT_ROOT}"
  fi
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
export TMPDIR="${BUILD_ROOT}/tmp"
export EM_CACHE="${BUILD_ROOT}/emscripten-cache"
export EMCC_CORES=4
mkdir -p "${TMPDIR}" "${EM_CACHE}"
printf '{"type":"commonjs"}\n' > "${BUILD_ROOT}/package.json"
PREFIX="${BUILD_ROOT}/install"
export PKG_CONFIG_LIBDIR="${PREFIX}/lib/pkgconfig"
export PKG_CONFIG_PATH=
# emconfigure overwrites PKG_CONFIG_LIBDIR/PATH; its documented bridge reads
# EM_PKG_CONFIG_PATH. Keep our Wasm-only dependency discoverable, never host libs.
export EM_PKG_CONFIG_PATH="${PREFIX}/lib/pkgconfig"
download() {
  curl --fail --location --retry 3 "$1" --output "$2"
  printf '%s  %s\n' "$3" "$2" | sha256sum --check --strict
}
cd "${BUILD_ROOT}"
download https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz ffmpeg.tar.xz \
  464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c
download https://codeload.github.com/cisco/openh264/tar.gz/652bdb7719f30b52b08e506645a7322ff1b2cc6f openh264.tar.gz \
  7a060916a9fcb63ba51d83a4f2388660c0b58797be547c4fa5c52e8d65660a85
tar -xf ffmpeg.tar.xz
tar -xf openh264.tar.gz
mv ffmpeg-8.1.2 ffmpeg
mv openh264-652bdb7719f30b52b08e506645a7322ff1b2cc6f openh264
if [[ "${WITHIN_H264_VAA_SIMD}" == 1 ]]; then
  node "${PROJECT_ROOT}/scripts/apply-vaa-simd.mjs"
fi
# Refuse source drift before the narrowly scoped, typed virtual-call fix.
printf '%s  %s\n' 4c86c9d87fdfb122f2892ca7984a0544877f99f43e4fe49eec9286021cef96eb \
  ffmpeg/libavcodec/libopenh264enc.c | sha256sum --check --strict
patch --fuzz=0 --directory=ffmpeg --strip=1 \
  < "${SCRIPT_DIR}/patches/openh264-force-intra-wasm.patch"
printf '%s  %s\n' 510df38d806692997594df40a2f587d55984a147e610c7546cfd749116dc264e \
  ffmpeg/libavformat/matroskaenc.c | sha256sum --check --strict
patch --fuzz=0 --directory=ffmpeg --strip=1 \
  < "${SCRIPT_DIR}/patches/matroska-bounded-no-cues.patch"
flags='-O3 -DNDEBUG -DGENERATED_VERSION_HEADER -fno-strict-aliasing -msimd128 -pthread'
if [[ -n "${H264_LIBRARY_LTO_FLAGS}" ]]; then flags+=" ${H264_LIBRARY_LTO_FLAGS}"; fi
(
  cd openh264
  emmake make -j4 libopenh264.a install-static OS=linux ARCH=wasm32 \
    USE_ASM=No USE_STACK_PROTECTOR=No CC=emcc CXX=em++ AR=emar \
    "CFLAGS=${flags}" "CXXFLAGS=${flags}" "PREFIX=${PREFIX}"
)
(
  cd ffmpeg
  trap 'status=$?; if [[ -f ffbuild/config.log ]]; then tail -n 120 ffbuild/config.log >&2; fi; exit "${status}"' ERR
  emconfigure ./configure --prefix="${PREFIX}" --cc=emcc --cxx=em++ \
    --ar=emar --ranlib=emranlib --nm=emnm --arch=wasm --target-os=none \
    --disable-everything --disable-autodetect --disable-programs --disable-doc \
    --disable-debug --disable-network --disable-devices --disable-avdevice \
    --disable-avfilter --disable-iconv --disable-zlib --disable-bzlib \
    --disable-lzma --disable-asm --disable-runtime-cpudetect --enable-pthreads \
    --enable-libopenh264 --enable-avformat --enable-avcodec --enable-avutil \
    --enable-swscale --disable-swresample --pkg-config=pkg-config --pkg-config-flags=--static \
    --enable-demuxer=matroska,mov,avi,mpegts,mpegvideo,h264,m4v,ogg,flv,ivf \
    --enable-muxer=mp4,matroska --enable-encoder=libopenh264 \
    --enable-decoder=h264,hevc,mpeg4,mpeg2video,theora,vp8,vp9,aac,mp3,flac,vorbis,opus \
    --enable-parser=h264,hevc,mpeg4video,mpegvideo,vp8,vp9,aac,mpegaudio,flac,vorbis,opus \
    --enable-bsf=aac_adtstoasc,h264_mp4toannexb,hevc_mp4toannexb,extract_extradata \
    --extra-cflags="-O3 -fno-math-errno -msimd128 -pthread ${H264_LIBRARY_LTO_FLAGS} -I${PREFIX}/include" \
    --extra-ldflags="-O3 -pthread ${H264_LIBRARY_LTO_FLAGS} -L${PREFIX}/lib"
  emmake make -j4
  emmake make install
)
node "${SCRIPT_DIR}/make-h264-candidate.mjs" "${BUILD_ROOT}/within_h264.c"
em++ -c "${SCRIPT_DIR}/openh264-force-intra.cpp" -I"${PREFIX}/include" \
  -O3 -flto -msimd128 -pthread -o "${BUILD_ROOT}/openh264-force-intra.o"
emcc "${BUILD_ROOT}/within_h264.c" -I"${PREFIX}/include" \
  "${PREFIX}/lib/libavformat.a" "${PREFIX}/lib/libavcodec.a" \
  "${PREFIX}/lib/libswscale.a" "${PREFIX}/lib/libavutil.a" \
  "${PREFIX}/lib/libopenh264.a" "${BUILD_ROOT}/openh264-force-intra.o" -lstdc++ \
  -O3 -flto -msimd128 -pthread --profiling-funcs --emit-symbol-map \
  -sPTHREAD_POOL_SIZE=0 -sPTHREAD_POOL_SIZE_STRICT=2 \
  -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=1048576 \
  -sALLOW_MEMORY_GROWTH=0 "-sINITIAL_MEMORY=${H264_FIXED_MEMORY_BYTES}" "-sMAXIMUM_MEMORY=${H264_FIXED_MEMORY_BYTES}" \
  -sSTACK_SIZE=1048576 -sMALLOC=emmalloc -sMODULARIZE=1 -sEXPORT_ES6=1 \
  -sENVIRONMENT=worker -sEXPORT_NAME=createWithinRemuxCore -sFILESYSTEM=0 \
  -sASSERTIONS=1 -sWASM_BIGINT=1 -sEXPORTED_FUNCTIONS='["_within_remux"]' \
  -sEXPORTED_RUNTIME_METHODS='["ccall"]' \
  -sASYNCIFY_IMPORTS='["within_input_read","within_output_write","within_output_rotate","within_output_truncate","within_output_flush"]' \
  -Wl,--no-entry -o "${OUTPUT_ROOT}/within-h264.mjs"
cp openh264/LICENSE "${OUTPUT_ROOT}/LICENSE.openh264"
cp ffmpeg/COPYING.LGPLv2.1 "${OUTPUT_ROOT}/LICENSE.ffmpeg"
cp ffmpeg/ffbuild/config.log "${OUTPUT_ROOT}/configure.log"
cp ffmpeg/config_components.h "${OUTPUT_ROOT}/config_components.h"
node "${SCRIPT_DIR}/h264-candidate-manifest.mjs" "${BUILD_ROOT}" "${OUTPUT_ROOT}"
# Corresponding unmodified dependency sources plus exact wrapper/recipes.
mkdir source-bundle
cp ffmpeg.tar.xz openh264.tar.gz within_h264.c "${SCRIPT_DIR}/h264-candidate.c" \
  "${SCRIPT_DIR}/make-h264-candidate.mjs" "${SCRIPT_DIR}/build-h264-candidate.sh" \
  "${SCRIPT_DIR}/h264-candidate-manifest.mjs" "${SCRIPT_DIR}/openh264-force-intra.cpp" \
  "${SCRIPT_DIR}/patches/openh264-force-intra-wasm.patch" \
  "${SCRIPT_DIR}/patches/matroska-bounded-no-cues.patch" source-bundle/
if [[ "${WITHIN_H264_VAA_SIMD}" == 1 ]]; then
  mkdir -p source-bundle/scripts/lib source-bundle/media/ffmpeg source-bundle/evidence
  cp "${PROJECT_ROOT}/scripts/apply-vaa-simd.mjs" source-bundle/scripts/
  cp "${PROJECT_ROOT}/scripts/lib/openh264-vaa-patch.mjs" \
    "${PROJECT_ROOT}/scripts/lib/openh264-vaa-reference.mjs" source-bundle/scripts/lib/
  cp "${SCRIPT_DIR}/openh264-vaa-simd.h" source-bundle/media/ffmpeg/
  cp "${PROJECT_ROOT}/evidence/openh264-vaa-arithmetic-2026-10-04.json" source-bundle/evidence/
  cp vaa-simd-patch.json source-bundle/
fi
tar -czf "${OUTPUT_ROOT}/corresponding-source.tar.gz" source-bundle
cd "${OUTPUT_ROOT}"
sha256sum ./*
