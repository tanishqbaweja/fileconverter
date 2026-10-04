#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
BUILD_ROOT="${PROJECT_ROOT}/work/h264-sad-arithmetic-build"
REPORT_ROOT="${PROJECT_ROOT}/outputs/reports"
[[ "$(emcc --version | head -1)" == *'6.0.4'* ]] || exit 2
[[ ! -e "${BUILD_ROOT}" ]] || { echo 'SAD arithmetic build already exists.' >&2; exit 2; }
mkdir -p "${PROJECT_ROOT}/work"
available_kib="$(df -Pk "${PROJECT_ROOT}/work" | awk 'NR == 2 { print $4 }')"
[[ "${available_kib}" =~ ^[0-9]+$ ]] && (( available_kib >= 1048576 )) || exit 2
mkdir -p "${BUILD_ROOT}" "${REPORT_ROOT}"
cleanup() {
  local status=$?
  [[ "${BUILD_ROOT}" == "${PROJECT_ROOT}/work/h264-sad-arithmetic-build" ]] || exit 2
  rm -rf -- "${BUILD_ROOT}"
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
export TMPDIR="${BUILD_ROOT}/tmp" EM_CACHE="${BUILD_ROOT}/cache" EMCC_CORES=4
mkdir -p "${TMPDIR}" "${EM_CACHE}"
curl --fail --location --retry 3 \
  https://raw.githubusercontent.com/cisco/openh264/652bdb7719f30b52b08e506645a7322ff1b2cc6f/codec/common/src/sad_common.cpp \
  --output "${BUILD_ROOT}/sad_common.cpp"
node "${PROJECT_ROOT}/scripts/generate-sad-reference.mjs"
# Match OpenH264 production optimization, aliasing, SIMD and pthread flags.
em++ "${SCRIPT_DIR}/openh264-sad-arithmetic.cpp" -I"${BUILD_ROOT}" -O3 -fno-strict-aliasing -msimd128 -pthread \
  -sPTHREAD_POOL_SIZE=0 -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 \
  -sSTACK_SIZE=1048576 -sMALLOC=emmalloc -sFILESYSTEM=0 -sMODULARIZE=1 \
  -sEXPORT_ES6=1 -sENVIRONMENT=node -sASSERTIONS=1 \
  -sEXPORTED_FUNCTIONS='["_sad_reference","_sad_simd","_sad_batch","_malloc","_free"]' \
  -sEXPORTED_RUNTIME_METHODS='["HEAPU8"]' \
  -Wl,--no-entry -o "${BUILD_ROOT}/sad-arithmetic.mjs"
node "${PROJECT_ROOT}/scripts/verify-sad-arithmetic.mjs"
