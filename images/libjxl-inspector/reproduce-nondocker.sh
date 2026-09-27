#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORK_ROOT="${PROJECT_ROOT}/work"
BUILD_ROOT="${WORK_ROOT}/jxl-inspector-nondocker-build"
OUTPUT_ROOT="${WORK_ROOT}/jxl-inspector-nondocker-output"
EXPECTED_ROOT="${PROJECT_ROOT}/public/engines/jxl-inspector"
KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"
MINIMUM_FREE_KIB="${WITHIN_MINIMUM_BUILD_FREE_KIB:-4194304}"
LIBJXL_COMMIT=a7a9c787341cf703dede03c2009fa460cae5e5df
BUILD_ROOT_CREATED=0
OUTPUT_ROOT_CREATED=0

fail() { printf '%s\n' "$*" >&2; exit 1; }
require_command() { command -v "$1" >/dev/null 2>&1 || fail "Required command is unavailable: $1"; }
run_privileged() { if [[ "$(id -u)" == "0" ]]; then "$@"; else sudo "$@"; fi; }
assert_work_path() { case "$1" in "${WORK_ROOT}"/*) ;; *) fail "Refusing non-repository build path: $1" ;; esac; }
remove_owned_symlink() {
  local link_path="$1" expected_target="$2"
  if [[ -L "${link_path}" ]]; then
    local actual_target
    actual_target="$(readlink -f "${link_path}")"
    if [[ "${actual_target}" == "${expected_target}" ]]; then
      run_privileged unlink "${link_path}"
    fi
  fi
}
cleanup() {
  local status=$?
  remove_owned_symlink /src "${BUILD_ROOT}"
  remove_owned_symlink /out "${OUTPUT_ROOT}"
  if [[ "${BUILD_ROOT_CREATED}" == "1" ]]; then rm -rf -- "${BUILD_ROOT}"; fi
  if [[ "${OUTPUT_ROOT_CREATED}" == "1" && "${KEEP_OUTPUT}" != "1" ]]; then
    rm -rf -- "${OUTPUT_ROOT}"
  fi
  exit "${status}"
}
trap cleanup EXIT INT TERM

[[ "$(uname -s)" == "Linux" ]] || fail "The no-Docker JPEG XL inspector build requires Linux."
if [[ -n "${EMSDK_NODE:-}" ]]; then
  [[ -x "${EMSDK_NODE}" ]] || fail "EMSDK_NODE is not executable: ${EMSDK_NODE}"
  export PATH="$(dirname "${EMSDK_NODE}"):${PATH}"
fi
for command_name in emcc emcmake cmake git sha256sum diff readlink find sort xargs df nproc; do
  require_command "${command_name}"
done
if [[ "$(id -u)" != "0" ]]; then require_command sudo; fi

assert_work_path "${BUILD_ROOT}"
assert_work_path "${OUTPUT_ROOT}"
[[ ! -e "${BUILD_ROOT}" ]] || fail "Build directory already exists: ${BUILD_ROOT}"
[[ ! -e "${OUTPUT_ROOT}" ]] || fail "Output directory already exists: ${OUTPUT_ROOT}"
[[ ! -e /src && ! -L /src ]] || fail "Refusing to replace existing /src"
[[ ! -e /out && ! -L /out ]] || fail "Refusing to replace existing /out"
mkdir -p "${BUILD_ROOT}" "${OUTPUT_ROOT}"
BUILD_ROOT_CREATED=1
OUTPUT_ROOT_CREATED=1
available_kib="$(df -Pk "${WORK_ROOT}" | awk 'NR == 2 { print $4 }')"
[[ "${available_kib}" =~ ^[0-9]+$ ]] || fail "Could not determine free disk space."
(( available_kib >= MINIMUM_FREE_KIB )) ||
  fail "JPEG XL inspector rebuild needs ${MINIMUM_FREE_KIB} KiB free; ${available_kib} KiB is available."
run_privileged ln -s "${BUILD_ROOT}" /src
run_privileged ln -s "${OUTPUT_ROOT}" /out

cd "${BUILD_ROOT}"
git clone --filter=blob:none --no-checkout https://github.com/libjxl/libjxl.git libjxl
git -C libjxl checkout "${LIBJXL_COMMIT}"
[[ "$(git -C libjxl rev-parse HEAD)" == "${LIBJXL_COMMIT}" ]] || fail "Pinned libjxl checkout mismatch."
git -C libjxl submodule update --init --depth 1 --recommend-shallow \
  third_party/brotli third_party/highway third_party/skcms
mkdir -p library-build wrapper
cp "${PROJECT_ROOT}/images/libjxl/CMakeLists.libraries.txt" library-build/CMakeLists.txt
cp "${SCRIPT_DIR}/CMakeLists.txt" wrapper/CMakeLists.txt
cp "${SCRIPT_DIR}/within_jxl_inspector.c" wrapper/within_jxl_inspector.c
cp "${SCRIPT_DIR}/build-module.sh" build-module.sh
export CFLAGS="-Oz -flto"
export CXXFLAGS="-Oz -flto"
export LDFLAGS="-Oz -flto"
emcmake cmake -S /src/library-build -B /src/build/libraries -DCMAKE_BUILD_TYPE=Release
cmake --build /src/build/libraries --target jxl_dec --parallel "$(nproc)"
chmod +x build-module.sh
./build-module.sh

if ! diff --recursive --brief --no-dereference "${EXPECTED_ROOT}" "${OUTPUT_ROOT}"; then
  printf 'Expected artifact hashes:\n' >&2
  (cd "${EXPECTED_ROOT}" && find . -type f -print0 | sort -z | xargs -0 sha256sum) >&2
  printf 'Rebuilt artifact hashes:\n' >&2
  (cd "${OUTPUT_ROOT}" && find . -type f -print0 | sort -z | xargs -0 sha256sum) >&2
  fail "No-Docker jxl-inspector artifacts differ from the published engine."
fi
printf 'Exact no-Docker jxl-inspector artifact comparison passed.\n'
