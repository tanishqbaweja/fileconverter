#!/usr/bin/env bash
set -euo pipefail
# Experimental artifacts only; never writes public/engines or existing cores.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORK_ROOT="${PROJECT_ROOT}/work"
BUILD_ROOT="${WORK_ROOT}/mpeg2-candidate-build"
OUTPUT_ROOT="${WORK_ROOT}/mpeg2-candidate-output"
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
  [[ "${BUILD_ROOT}" == "${PROJECT_ROOT}/work/mpeg2-candidate-build" ]] || exit 2
  rm -rf -- "${BUILD_ROOT}"
  if [[ "${WITHIN_KEEP_MPEG2_CANDIDATE:-0}" != 1 || "${status}" != 0 ]]; then
    [[ "${OUTPUT_ROOT}" == "${PROJECT_ROOT}/work/mpeg2-candidate-output" ]] || exit 2
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
tar -xf ffmpeg.tar.xz
mv ffmpeg-8.1.2 ffmpeg
printf '%s  %s\n' 510df38d806692997594df40a2f587d55984a147e610c7546cfd749116dc264e \
  ffmpeg/libavformat/matroskaenc.c | sha256sum --check --strict
patch --fuzz=0 --directory=ffmpeg --strip=1 \
  < "${SCRIPT_DIR}/patches/matroska-bounded-no-cues.patch"
(
  cd ffmpeg
  trap 'status=$?; if [[ -f ffbuild/config.log ]]; then tail -n 120 ffbuild/config.log >&2; fi; exit "${status}"' ERR
  emconfigure ./configure --prefix="${PREFIX}" --cc=emcc --cxx=em++ \
    --ar=emar --ranlib=emranlib --nm=emnm --arch=wasm --target-os=none \
    --disable-everything --disable-autodetect --disable-programs --disable-doc \
    --disable-debug --disable-network --disable-devices --disable-avdevice \
    --disable-avfilter --disable-iconv --disable-zlib --disable-bzlib \
    --disable-lzma --disable-asm --disable-runtime-cpudetect --enable-pthreads \
    --enable-avformat --enable-avcodec --enable-avutil \
    --enable-swscale --disable-swresample --pkg-config=pkg-config --pkg-config-flags=--static \
    --enable-demuxer=matroska,mov,avi,mpegts,mpegvideo,h264,m4v,ogg,flv,ivf \
    --enable-muxer=mp4,matroska --enable-encoder=mpeg2video \
    --enable-decoder=h264,hevc,mpeg4,mpeg2video,theora,vp8,vp9 \
    --enable-parser=h264,hevc,mpeg4video,mpegvideo,vp8,vp9,aac,mpegaudio,flac,vorbis,opus \
    --enable-bsf=aac_adtstoasc,h264_mp4toannexb,hevc_mp4toannexb,extract_extradata \
    --extra-cflags="-O3 -fno-math-errno -msimd128 -pthread -I${PREFIX}/include" \
    --extra-ldflags="-O3 -pthread -L${PREFIX}/lib"
  emmake make -j4
  emmake make install
)
node "${SCRIPT_DIR}/make-mpeg2-candidate.mjs" "${BUILD_ROOT}/within_mpeg2.c"
emcc "${BUILD_ROOT}/within_mpeg2.c" -I"${PREFIX}/include" \
  "${PREFIX}/lib/libavformat.a" "${PREFIX}/lib/libavcodec.a" \
  "${PREFIX}/lib/libswscale.a" "${PREFIX}/lib/libavutil.a" \
  -O3 -flto -msimd128 -pthread --profiling-funcs --emit-symbol-map \
  -sPTHREAD_POOL_SIZE=0 -sPTHREAD_POOL_SIZE_STRICT=2 \
  -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=1048576 \
  -sALLOW_MEMORY_GROWTH=0 "-sINITIAL_MEMORY=33554432" "-sMAXIMUM_MEMORY=33554432" \
  -sSTACK_SIZE=1048576 -sMALLOC=emmalloc -sMODULARIZE=1 -sEXPORT_ES6=1 \
  -sENVIRONMENT=worker -sEXPORT_NAME=createWithinRemuxCore -sFILESYSTEM=0 \
  -sASSERTIONS=1 -sWASM_BIGINT=1 -sEXPORTED_FUNCTIONS='["_within_remux"]' \
  -sEXPORTED_RUNTIME_METHODS='["ccall"]' \
  -sASYNCIFY_IMPORTS='["within_input_read","within_output_write","within_output_rotate","within_output_truncate","within_output_flush"]' \
  -Wl,--no-entry -o "${OUTPUT_ROOT}/within-mpeg2.mjs"
cp ffmpeg/COPYING.LGPLv2.1 "${OUTPUT_ROOT}/LICENSE.ffmpeg"
cp ffmpeg/ffbuild/config.log "${OUTPUT_ROOT}/configure.log"
cp ffmpeg/config_components.h "${OUTPUT_ROOT}/config_components.h"
node "${SCRIPT_DIR}/mpeg2-candidate-manifest.mjs" "${BUILD_ROOT}" "${OUTPUT_ROOT}"
# Corresponding dependency source, exact generated wrapper, recipe and patch.
mkdir source-bundle
cp ffmpeg.tar.xz within_mpeg2.c "${SCRIPT_DIR}/within_remux.c" "${SCRIPT_DIR}/mpeg2-candidate.c" \
  "${SCRIPT_DIR}/make-mpeg2-candidate.mjs" "${SCRIPT_DIR}/build-mpeg2-candidate.sh" \
  "${SCRIPT_DIR}/mpeg2-candidate-manifest.mjs" \
  "${SCRIPT_DIR}/patches/matroska-bounded-no-cues.patch" source-bundle/
tar -czf "${OUTPUT_ROOT}/corresponding-source.tar.gz" source-bundle
cd "${OUTPUT_ROOT}"
sha256sum ./*
