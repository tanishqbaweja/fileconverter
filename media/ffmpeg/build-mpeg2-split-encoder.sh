#!/usr/bin/env bash
set -euo pipefail
# Actual private MPEG2 encoder module; Node checks initialize only, never encode.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_ROOT="${PROJECT_ROOT}/work/mpeg2-split-encoder-build"
OUTPUT_ROOT="${PROJECT_ROOT}/work/mpeg2-split-encoder-output"
[[ "$(uname -s)" == Linux && "$(emcc --version | head -1)" == *'6.0.4'* ]] || exit 2
[[ ! -e "${BUILD_ROOT}" && ! -e "${OUTPUT_ROOT}" ]] || { echo 'Owned encoder paths exist; inspect, never overwrite.' >&2; exit 2; }
mkdir -p "${PROJECT_ROOT}/work"
available_kib="$(df -Pk "${PROJECT_ROOT}/work" | awk 'NR == 2 { print $4 }')"
[[ "${available_kib}" =~ ^[0-9]+$ ]] && (( available_kib >= 1048576 )) || exit 2
mkdir -p "${BUILD_ROOT}" "${OUTPUT_ROOT}"
cleanup() {
  local status=$?
  [[ "${BUILD_ROOT}" == "${PROJECT_ROOT}/work/mpeg2-split-encoder-build" && ! -L "${BUILD_ROOT}" ]] || exit 2
  rm -rf -- "${BUILD_ROOT}"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
export TMPDIR="${BUILD_ROOT}/tmp" EM_CACHE="${BUILD_ROOT}/cache" EMCC_CORES=4
mkdir -p "${TMPDIR}" "${EM_CACHE}"
printf '{"type":"commonjs"}\n' > "${BUILD_ROOT}/package.json"
curl --fail --location --retry 3 https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz --output "${BUILD_ROOT}/ffmpeg.tar.xz"
printf '%s  %s\n' 464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c "${BUILD_ROOT}/ffmpeg.tar.xz" | sha256sum --check --strict
tar -xf "${BUILD_ROOT}/ffmpeg.tar.xz" --directory "${BUILD_ROOT}"
FFMPEG_ROOT="${BUILD_ROOT}/ffmpeg-8.1.2"
for source_check in \
  '38efe5e7fc627437306290919c8de3e2de5817d611b29d1f98e7ee6c12a8fb19 libavcodec/get_buffer.c' \
  'd8936c56db57fe53d9836e950563483104670c2fc98687f87fb497e078ba742f libavutil/refstruct.c' \
  '8e7be80109d14fce52e3de7a30932efea283abe963ccdd755787e219a4699b19 libavutil/refstruct.h' \
  '80e1e8455035bd95de6fd051d54a4814db5c791811757cfaaaba16f422595ca4 libavcodec/mpegvideo.c'; do
  read -r source_hash source_name <<< "${source_check}"
  printf '%s  %s\n' "${source_hash}" "${FFMPEG_ROOT}/${source_name}" | sha256sum --check --strict
done
patch --fuzz=0 --directory="${FFMPEG_ROOT}" --strip=1 < "${SCRIPT_DIR}/patches/mpeg2-encoder-uncached-frame-buffers.patch"
patch --fuzz=0 --directory="${FFMPEG_ROOT}" --strip=1 < "${SCRIPT_DIR}/patches/mpeg2-encoder-uncached-accessories.patch"
for source_check in \
  '62a73fe537318e4706f25904022d071e8f8ef9535b5334bf5c7b650e572c0478 libavcodec/get_buffer.c' \
  'e31af1df1e6e7b60b9112e2fcd22917664bc365d65db6c1d2b7038f5d532e084 libavutil/refstruct.c' \
  '4a2b2d1db11b794c3b8f4963e31cfb23124d09cdf8f0d6998037cbf344b45d9f libavcodec/mpegvideo.c'; do
  read -r source_hash source_name <<< "${source_check}"
  printf '%s  %s\n' "${source_hash}" "${FFMPEG_ROOT}/${source_name}" | sha256sum --check --strict
done
(
  cd "${FFMPEG_ROOT}"
  trap 'status=$?; if [[ -f ffbuild/config.log ]]; then tail -n 120 ffbuild/config.log >&2; fi; exit "${status}"' ERR
  emconfigure ./configure --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib --nm=emnm \
    --arch=wasm --target-os=none --disable-everything --disable-autodetect --disable-programs --disable-doc \
    --disable-debug --disable-network --disable-devices --disable-avdevice --disable-avfilter --disable-avformat \
    --disable-swscale --disable-swresample --enable-avcodec --enable-avutil --enable-encoder=mpeg2video \
    --enable-pthreads --disable-asm --disable-runtime-cpudetect --disable-iconv --disable-zlib --disable-bzlib \
    --disable-lzma --extra-cflags='-O3 -fno-math-errno -msimd128 -pthread' --extra-ldflags='-O3 -pthread'
  emmake make -j4 libavcodec/libavcodec.a libavutil/libavutil.a
)
# Same already-tested final-reference-only cache policy; execute the native gate.
emcc "${SCRIPT_DIR}/mpeg2-accessory-smoke.c" -I"${FFMPEG_ROOT}" "${FFMPEG_ROOT}/libavutil/libavutil.a" \
  -O2 -UNDEBUG -pthread -sPTHREAD_POOL_SIZE=0 -sMALLOC=dlmalloc -sENVIRONMENT=node -sFILESYSTEM=0 \
  -sEXIT_RUNTIME=1 -sASSERTIONS=1 -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=16777216 \
  -o "${BUILD_ROOT}/accessory-smoke.js"
node "${BUILD_ROOT}/accessory-smoke.js" > "${OUTPUT_ROOT}/mpeg2-accessory-smoke.json"
emcc "${SCRIPT_DIR}/mpeg2-split-encoder.c" -I"${FFMPEG_ROOT}" \
  "${FFMPEG_ROOT}/libavcodec/libavcodec.a" "${FFMPEG_ROOT}/libavutil/libavutil.a" \
  -O3 -flto -msimd128 -pthread -sMALLOC=dlmalloc -sPTHREAD_POOL_SIZE=0 -sPTHREAD_POOL_SIZE_STRICT=2 \
  -sFILESYSTEM=0 -sMODULARIZE=1 -sEXPORT_ES6=1 -sENVIRONMENT=worker,node -sASSERTIONS=1 -sWASM_BIGINT=1 \
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=16777216 -sMAXIMUM_MEMORY=16777216 \
  -sSTACK_SIZE=262144 -sSTACK_OVERFLOW_CHECK=2 \
  -sEXPORTED_FUNCTIONS='["_within_split_encoder_config","_within_split_encoder_properties","_within_split_encoder_parameters","_within_split_encoder_parameter_bytes","_within_split_encoder_state","_within_split_encoder_frames","_within_split_encoder_packets","_within_split_encoder_input_refs","_within_split_encoder_open","_within_split_encoder_close","_within_split_encoder_settings_match","_within_split_encoder_parameters_check","_within_split_encoder_prepare","_within_split_encoder_abort_frame","_within_split_encoder_send","_within_split_encoder_flush","_within_split_encoder_next_packet","_within_split_encoder_packet_record","_within_split_encoder_release_packet","_emscripten_stack_get_base","_emscripten_stack_get_end"]' \
  -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' -Wl,--no-entry -o "${OUTPUT_ROOT}/split-encoder.mjs"
cp "${FFMPEG_ROOT}/config_components.h" "${OUTPUT_ROOT}/config_components.h"
cp "${FFMPEG_ROOT}/COPYING.LGPLv2.1" "${OUTPUT_ROOT}/LICENSE.LGPLv2.1"
# Small exact corresponding wrapper/patch sources; upstream release is hash-pinned
# in the recipe. The private module is not placed in public/ or the registry.
for file in mpeg2-split-encoder.c mpeg2-split-frame-layout.h mpeg2-split-frame-properties.h mpeg2-split-codec-parameters.h build-mpeg2-split-encoder.sh; do
  cp "${SCRIPT_DIR}/${file}" "${OUTPUT_ROOT}/${file}"
done
cp "${SCRIPT_DIR}/patches/mpeg2-encoder-uncached-frame-buffers.patch" "${OUTPUT_ROOT}/"
cp "${SCRIPT_DIR}/patches/mpeg2-encoder-uncached-accessories.patch" "${OUTPUT_ROOT}/"
node "${PROJECT_ROOT}/scripts/verify-mpeg2-split-encoder-native.mjs"
test -s "${OUTPUT_ROOT}/initialization-contract.json"
