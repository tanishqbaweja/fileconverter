#!/usr/bin/env bash
set -euo pipefail

# Rebuild one published JPEG XL Wasm variant with a pinned, activated Emscripten
# SDK. Canonical /src and /out paths are temporary symlinks into repository-local
# scratch roots owned by this invocation.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENCODER_DIR="${PROJECT_ROOT}/images/libjxl-encoder"
WORK_ROOT="${PROJECT_ROOT}/work"
VARIANT="${1:-}"
KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"
MINIMUM_FREE_KIB="${WITHIN_MINIMUM_BUILD_FREE_KIB:-4194304}"

LIBJXL_COMMIT=a7a9c787341cf703dede03c2009fa460cae5e5df
LIBPNG_VERSION=1.6.58
LIBPNG_SHA256=28eb403f51f0f7405249132cecfe82ea5c0ef97f1b32c5a65828814ae0d34775
ZLIB_VERSION=1.3.2
ZLIB_SHA256=d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3

case "${VARIANT}" in
  decoder)
    ENGINE_ID=jxl
    ;;
  encoder)
    ENGINE_ID=jxl-encoder
    ;;
  *)
    printf 'Usage: %s decoder|encoder\n' "$0" >&2
    exit 2
    ;;
esac

BUILD_ROOT="${WORK_ROOT}/${ENGINE_ID}-nondocker-build"
OUTPUT_ROOT="${WORK_ROOT}/${ENGINE_ID}-nondocker-output"
EXPECTED_ROOT="${PROJECT_ROOT}/public/engines/${ENGINE_ID}"
BUILD_ROOT_CREATED=0
OUTPUT_ROOT_CREATED=0

fail() {
  printf '%s\n' "$*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command is unavailable: $1"
}

run_privileged() {
  if [[ "$(id -u)" == "0" ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

assert_work_path() {
  case "$1" in
    "${WORK_ROOT}"/*) ;;
    *) fail "Refusing non-repository build path: $1" ;;
  esac
}

remove_owned_symlink() {
  local link_path="$1"
  local expected_target="$2"
  if [[ -L "${link_path}" ]]; then
    local actual_target
    actual_target="$(readlink -f "${link_path}")"
    if [[ "${actual_target}" == "${expected_target}" ]]; then
      run_privileged unlink "${link_path}"
    else
      printf 'Leaving unexpected symlink untouched: %s -> %s\n' \
        "${link_path}" "${actual_target}" >&2
    fi
  fi
}

cleanup() {
  local status=$?
  remove_owned_symlink /src "${BUILD_ROOT}"
  remove_owned_symlink /out "${OUTPUT_ROOT}"
  if [[ "${BUILD_ROOT_CREATED}" == "1" ]]; then
    rm -rf -- "${BUILD_ROOT}"
  fi
  if [[ "${OUTPUT_ROOT_CREATED}" == "1" && "${KEEP_OUTPUT}" != "1" ]]; then
    rm -rf -- "${OUTPUT_ROOT}"
  fi
  exit "${status}"
}
trap cleanup EXIT INT TERM

[[ "$(uname -s)" == "Linux" ]] ||
  fail "The non-Docker JPEG XL reproduction path currently requires Linux."
if [[ -n "${EMSDK_NODE:-}" ]]; then
  [[ -x "${EMSDK_NODE}" ]] ||
    fail "EMSDK_NODE does not identify an executable: ${EMSDK_NODE}"
  export PATH="$(dirname "${EMSDK_NODE}"):${PATH}"
fi
for command_name in \
    emcc emconfigure emmake emcmake cmake git curl tar sha256sum diff sed readlink \
    awk find sort xargs df nproc make; do
  require_command "${command_name}"
done
if [[ "$(id -u)" != "0" ]]; then
  require_command sudo
fi

assert_work_path "${BUILD_ROOT}"
assert_work_path "${OUTPUT_ROOT}"
[[ ! -e "${BUILD_ROOT}" ]] || fail "Build directory already exists: ${BUILD_ROOT}"
[[ ! -e "${OUTPUT_ROOT}" ]] || fail "Output directory already exists: ${OUTPUT_ROOT}"
[[ ! -e /src && ! -L /src ]] || fail "Refusing to replace existing /src"
[[ ! -e /out && ! -L /out ]] || fail "Refusing to replace existing /out"

mkdir -p "${WORK_ROOT}" "${BUILD_ROOT}"
BUILD_ROOT_CREATED=1
mkdir -p "${OUTPUT_ROOT}"
OUTPUT_ROOT_CREATED=1
available_kib="$(df -Pk "${WORK_ROOT}" | awk 'NR == 2 { print $4 }')"
[[ "${available_kib}" =~ ^[0-9]+$ ]] || fail "Could not determine free disk space."
(( available_kib >= MINIMUM_FREE_KIB )) ||
  fail "JPEG XL rebuild needs at least ${MINIMUM_FREE_KIB} KiB free; ${available_kib} KiB is available."

run_privileged ln -s "${BUILD_ROOT}" /src
run_privileged ln -s "${OUTPUT_ROOT}" /out

cd "${BUILD_ROOT}"
git clone --filter=blob:none --no-checkout https://github.com/libjxl/libjxl.git libjxl
git -C libjxl checkout "${LIBJXL_COMMIT}"
[[ "$(git -C libjxl rev-parse HEAD)" == "${LIBJXL_COMMIT}" ]] ||
  fail "libjxl checkout does not match the pinned commit."
git -C libjxl submodule update --init --depth 1 --recommend-shallow \
  third_party/brotli third_party/highway third_party/libpng third_party/skcms

mkdir -p wrapper
if [[ "${VARIANT}" == "decoder" ]]; then
  mkdir -p library-build
  cp "${SCRIPT_DIR}/CMakeLists.libraries.txt" "${BUILD_ROOT}/library-build/CMakeLists.txt"
  cp "${SCRIPT_DIR}/CMakeLists.txt" "${BUILD_ROOT}/wrapper/CMakeLists.txt"
  cp "${SCRIPT_DIR}/within_jxl.c" "${BUILD_ROOT}/wrapper/within_jxl.c"
  cp "${SCRIPT_DIR}/build-libraries.sh" "${BUILD_ROOT}/build-libraries.sh"
  cp "${SCRIPT_DIR}/build-module.sh" "${BUILD_ROOT}/build-module.sh"

  curl --fail --location --retry 3 \
    "https://download.sourceforge.net/libpng/libpng-${LIBPNG_VERSION}.tar.xz" \
    --output libpng.tar.xz
  printf '%s  %s\n' "${LIBPNG_SHA256}" libpng.tar.xz |
    sha256sum --check --strict
  tar --extract --file libpng.tar.xz
  mv "libpng-${LIBPNG_VERSION}" libpng
  rm -- libpng.tar.xz

  curl --fail --location --retry 3 \
    "https://zlib.net/zlib-${ZLIB_VERSION}.tar.xz" \
    --output zlib.tar.xz
  printf '%s  %s\n' "${ZLIB_SHA256}" zlib.tar.xz |
    sha256sum --check --strict
  tar --extract --file zlib.tar.xz
  mv "zlib-${ZLIB_VERSION}" zlib
  rm -- zlib.tar.xz

  chmod +x build-libraries.sh build-module.sh
  ./build-libraries.sh
  ./build-module.sh
else
  cp "${ENCODER_DIR}/CMakeLists.txt" "${BUILD_ROOT}/wrapper/CMakeLists.txt"
  cp "${ENCODER_DIR}/within_jxl_encode.c" "${BUILD_ROOT}/wrapper/within_jxl_encode.c"
  cp "${ENCODER_DIR}/build-module.sh" "${BUILD_ROOT}/build-module.sh"
  chmod +x build-module.sh
  ./build-module.sh
fi

if ! diff --recursive --brief --no-dereference \
    "${EXPECTED_ROOT}" "${OUTPUT_ROOT}"; then
  printf 'Expected artifact hashes:\n' >&2
  (
    cd "${EXPECTED_ROOT}"
    find . -type f -print0 | sort -z | xargs -0 sha256sum
  ) >&2
  printf 'Rebuilt artifact hashes:\n' >&2
  (
    cd "${OUTPUT_ROOT}"
    find . -type f -print0 | sort -z | xargs -0 sha256sum
  ) >&2
  fail "Non-Docker ${ENGINE_ID} artifacts differ from the published engine."
fi
printf 'Exact non-Docker %s artifact comparison passed.\n' "${ENGINE_ID}"
