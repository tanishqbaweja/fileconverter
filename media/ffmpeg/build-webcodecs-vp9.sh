#!/usr/bin/env bash
set -euo pipefail
# Private source build only: unchanged real FFmpeg AVIO/demux/decode/mux wrapper,
# with one registered browser-codec encoder. Never converts media in Node/native.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_ROOT="${PROJECT_ROOT}/work/webcodecs-vp9-build"
OUTPUT_ROOT="${PROJECT_ROOT}/work/webcodecs-vp9-output"
[[ "$(uname -s)" == Linux && "$(emcc --version | head -1)" == *'6.0.4'* ]] || exit 2
mkdir -p "${PROJECT_ROOT}/work"
[[ ! -L "${PROJECT_ROOT}/work" && ! -e "${BUILD_ROOT}" && ! -e "${OUTPUT_ROOT}" ]] || exit 2
available_kib="$(df -Pk "${PROJECT_ROOT}/work" | awk 'NR == 2 { print $4 }')"
[[ "${available_kib}" =~ ^[0-9]+$ ]] && (( available_kib >= 8388608 )) || exit 2
mkdir "${BUILD_ROOT}" "${OUTPUT_ROOT}"
succeeded=0
cleanup() {
  local status=$?
  [[ "${BUILD_ROOT}" == "${PROJECT_ROOT}/work/webcodecs-vp9-build" && ! -L "${BUILD_ROOT}" ]] || exit 2
  [[ "${OUTPUT_ROOT}" == "${PROJECT_ROOT}/work/webcodecs-vp9-output" && ! -L "${OUTPUT_ROOT}" ]] || exit 2
  rm -rf -- "${BUILD_ROOT}"
  if [[ "${succeeded}" != 1 ]]; then rm -rf -- "${OUTPUT_ROOT}"; fi
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
export TMPDIR="${BUILD_ROOT}/tmp" EM_CACHE="${BUILD_ROOT}/cache" EMCC_CORES=4
mkdir "${TMPDIR}" "${EM_CACHE}"
curl --fail --location --retry 3 --retry-all-errors --retry-delay 2 --retry-max-time 120 --connect-timeout 20 --max-time 120 \
  https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz --output "${BUILD_ROOT}/ffmpeg.tar.xz"
printf '%s  %s\n' 464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c "${BUILD_ROOT}/ffmpeg.tar.xz" | sha256sum --check --strict
tar -xf "${BUILD_ROOT}/ffmpeg.tar.xz" --directory "${BUILD_ROOT}"
FFMPEG_ROOT="${BUILD_ROOT}/ffmpeg-8.1.2"
node "${SCRIPT_DIR}/register-webcodecs-vp9.mjs"
(
  cd "${FFMPEG_ROOT}"
  trap 'status=$?; if [[ -f ffbuild/config.log ]]; then tail -n 100 ffbuild/config.log >&2; fi; exit "${status}"' ERR
  emconfigure ./configure --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib --nm=emnm \
    --arch=wasm --target-os=none --disable-everything --disable-autodetect --disable-programs --disable-doc \
    --disable-debug --disable-network --disable-devices --disable-avdevice --disable-avfilter \
    --enable-avformat --enable-avcodec --enable-avutil --enable-swscale --enable-swresample \
    --enable-demuxer=ogg,matroska,mov,avi,h264,hevc,mpegvideo,m4v,ivf \
    --enable-decoder=theora,vorbis,h264,hevc,vp8,vp9,mpeg4,mpeg2video \
    --enable-parser=h264,hevc,vp8,vp9,mpeg4video,mpegvideo,vorbis \
    --enable-encoder=within_webcodecs_vp9 --enable-muxer=webm --enable-bsf=vp9_superframe \
    --disable-pthreads --disable-w32threads --disable-os2threads --disable-asm --disable-runtime-cpudetect \
    --disable-iconv --disable-zlib --disable-bzlib --disable-lzma \
    --extra-cflags="-O3 -fno-math-errno -msimd128 -I${SCRIPT_DIR}" --extra-ldflags='-O3'
  emmake make -j4 libavformat/libavformat.a libavcodec/libavcodec.a libswresample/libswresample.a libswscale/libswscale.a libavutil/libavutil.a
)
emcc "${SCRIPT_DIR}/within_remux.c" -I"${FFMPEG_ROOT}" -DWITHIN_VIDEO_THREADS=1 -DWITHIN_AVIO_OUTPUT_BUFFER_SIZE=262144 \
  "${FFMPEG_ROOT}/libavformat/libavformat.a" "${FFMPEG_ROOT}/libavcodec/libavcodec.a" \
  "${FFMPEG_ROOT}/libswresample/libswresample.a" "${FFMPEG_ROOT}/libswscale/libswscale.a" "${FFMPEG_ROOT}/libavutil/libavutil.a" \
  -O3 -flto -msimd128 -sMALLOC=emmalloc -sFILESYSTEM=0 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=worker \
  -sASSERTIONS=1 -sWASM_BIGINT=1 -sJSPI=1 -sJSPI_EXPORTS='["within_remux"]' \
  -sJSPI_IMPORTS='["within_input_read","within_output_write","within_output_truncate","within_output_flush","within_wc_open","within_wc_frame"]' \
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 -sSTACK_SIZE=262144 -sSTACK_OVERFLOW_CHECK=2 \
  -sEXPORTED_FUNCTIONS='["_within_remux","_emscripten_stack_get_base","_emscripten_stack_get_end"]' \
  -sEXPORTED_RUNTIME_METHODS='["ccall","HEAPU8"]' -Wl,--no-entry -o "${OUTPUT_ROOT}/within-webcodecs-vp9.mjs"
cp "${FFMPEG_ROOT}/config_components.h" "${OUTPUT_ROOT}/config_components.h"
cp "${FFMPEG_ROOT}/ffbuild/config.mak" "${OUTPUT_ROOT}/config.mak"
cp "${FFMPEG_ROOT}/COPYING.LGPLv2.1" "${OUTPUT_ROOT}/LICENSE.LGPLv2.1"
for file in within_remux.c within_webcodecs_vp9.c mpeg2-split-frame-layout.h build-webcodecs-vp9.sh register-webcodecs-vp9.mjs; do
  cp "${SCRIPT_DIR}/${file}" "${OUTPUT_ROOT}/${file}"
done
cp "${PROJECT_ROOT}/workers/webcodecs-vp9-bridge.mjs" "${OUTPUT_ROOT}/webcodecs-vp9-bridge.mjs"
node "${PROJECT_ROOT}/scripts/verify-webcodecs-vp9-native.mjs"
test -s "${OUTPUT_ROOT}/native-contract.json"
succeeded=1
