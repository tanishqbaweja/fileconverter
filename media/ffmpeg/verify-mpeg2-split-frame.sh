#!/usr/bin/env bash
set -euo pipefail
# Synthetic libavutil frame transport only. No codec/media conversion or Docker.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_ROOT="${PROJECT_ROOT}/work/mpeg2-split-frame-build"
REPORT_ROOT="${PROJECT_ROOT}/outputs/reports"
[[ "$(uname -s)" == Linux && "$(emcc --version | head -1)" == *'6.0.4'* ]] || exit 2
[[ ! -e "${BUILD_ROOT}" ]] || { echo 'Split frame unit scratch exists; inspect, do not overwrite.' >&2; exit 2; }
mkdir -p "${PROJECT_ROOT}/work"
available_kib="$(df -Pk "${PROJECT_ROOT}/work" | awk 'NR == 2 { print $4 }')"
[[ "${available_kib}" =~ ^[0-9]+$ ]] && (( available_kib >= 1048576 )) || exit 2
mkdir -p "${BUILD_ROOT}" "${REPORT_ROOT}"
cleanup() {
  local status=$?
  [[ "${BUILD_ROOT}" == "${PROJECT_ROOT}/work/mpeg2-split-frame-build" && ! -L "${BUILD_ROOT}" ]] || exit 2
  rm -rf -- "${BUILD_ROOT}"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
export TMPDIR="${BUILD_ROOT}/tmp" EM_CACHE="${BUILD_ROOT}/cache" EMCC_CORES=4
mkdir -p "${TMPDIR}" "${EM_CACHE}"
# FFmpeg's Emscripten compiler probe emits CommonJS .js in TMPDIR. The project
# is type:module; match the successful existing recipe's owned package boundary.
printf '{"type":"commonjs"}\n' > "${BUILD_ROOT}/package.json"
curl --fail --location --retry 3 https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz \
  --output "${BUILD_ROOT}/ffmpeg.tar.xz"
printf '%s  %s\n' 464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c \
  "${BUILD_ROOT}/ffmpeg.tar.xz" | sha256sum --check --strict
tar -xf "${BUILD_ROOT}/ffmpeg.tar.xz" --directory "${BUILD_ROOT}"
FFMPEG_ROOT="${BUILD_ROOT}/ffmpeg-8.1.2"
for source_check in \
  '3f004de1ba09a2f1749eea93d7c75d1a942732532b669a165517091203566534 frame.c' \
  '91275238d0abfc4fef41f2f6a4f182e279886af78e2f525864329279206a3be9 frame.h'; do
  read -r source_hash source_name <<< "${source_check}"
  printf '%s  %s\n' "${source_hash}" "${FFMPEG_ROOT}/libavutil/${source_name}" | sha256sum --check --strict
done
(
  cd "${FFMPEG_ROOT}"
  trap 'status=$?; if [[ -f ffbuild/config.log ]]; then tail -n 120 ffbuild/config.log >&2; fi; exit "${status}"' ERR
  emconfigure ./configure --cc=emcc --cxx=em++ --ar=emar --ranlib=emranlib --nm=emnm \
    --arch=wasm --target-os=none --disable-everything --disable-autodetect \
    --disable-programs --disable-doc --disable-debug --disable-network --disable-devices \
    --disable-avdevice --disable-avfilter --disable-avformat --disable-avcodec \
    --disable-swscale --disable-swresample --enable-avutil --enable-pthreads \
    --disable-asm --disable-runtime-cpudetect --disable-iconv --disable-zlib \
    --disable-bzlib --disable-lzma --extra-cflags='-O3 -msimd128 -pthread' \
    --extra-ldflags='-O3 -pthread'
  emmake make -j4 libavutil/libavutil.a
)
for role in decoder encoder; do
  memory_bytes=33554432
  if [[ "${role}" == encoder ]]; then memory_bytes=16777216; fi
  emcc "${SCRIPT_DIR}/mpeg2-split-frame-smoke.c" -I"${FFMPEG_ROOT}" \
    "${FFMPEG_ROOT}/libavutil/libavutil.a" -O3 -msimd128 -pthread \
    -sMALLOC=dlmalloc -sPTHREAD_POOL_SIZE=0 -sFILESYSTEM=0 -sMODULARIZE=1 \
    -sEXPORT_ES6=1 -sENVIRONMENT=node -sASSERTIONS=1 -sWASM_BIGINT=1 \
    -sALLOW_MEMORY_GROWTH=0 "-sINITIAL_MEMORY=${memory_bytes}" "-sMAXIMUM_MEMORY=${memory_bytes}" \
    -sSTACK_SIZE=262144 -sSTACK_OVERFLOW_CHECK=2 \
    -sEXPORTED_FUNCTIONS='["_within_split_smoke_create","_within_split_smoke_describe","_within_split_smoke_references","_within_split_smoke_destroy","_emscripten_stack_get_base","_emscripten_stack_get_end"]' \
    -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' \
    -Wl,--no-entry -o "${BUILD_ROOT}/split-${role}.mjs"
done
node "${PROJECT_ROOT}/scripts/verify-mpeg2-split-frame-native.mjs"
test -s "${REPORT_ROOT}/mpeg2-split-frame-contract.json"
