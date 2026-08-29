#!/usr/bin/env bash
set -euo pipefail

# Rebuild the published TIFF Wasm engine with an already-activated, pinned
# Emscripten SDK. Temporary canonical build paths point only at repository-local
# scratch directories owned by this invocation.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORK_ROOT="${PROJECT_ROOT}/work"
BUILD_ROOT="${WORK_ROOT}/tiff-nondocker-build"
OUTPUT_ROOT="${WORK_ROOT}/tiff-nondocker-output"
EXPECTED_ROOT="${PROJECT_ROOT}/public/engines/tiff"
KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"
MINIMUM_FREE_KIB="${WITHIN_MINIMUM_BUILD_FREE_KIB:-2097152}"
BUILD_ROOT_CREATED=0
OUTPUT_ROOT_CREATED=0

LIBTIFF_VERSION=4.7.2
LIBTIFF_SHA256=4996f0c4f93094719b1ca5c6279b20e588773ba8a247533e486416fb662ddb88
LIBPNG_VERSION=1.6.58
LIBPNG_SHA256=28eb403f51f0f7405249132cecfe82ea5c0ef97f1b32c5a65828814ae0d34775
ZLIB_VERSION=1.3.2
ZLIB_SHA256=d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3
LIBJPEG_TURBO_VERSION=3.1.4.1
LIBJPEG_TURBO_SHA256=ecae8008e2cc9ade2f2c1bb9d5e6d4fb73e7c433866a056bd82980741571a022

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
  fail "The non-Docker TIFF reproduction path currently requires Linux."
if [[ -n "${EMSDK_NODE:-}" ]]; then
  [[ -x "${EMSDK_NODE}" ]] ||
    fail "EMSDK_NODE does not identify an executable: ${EMSDK_NODE}"
  export PATH="$(dirname "${EMSDK_NODE}"):${PATH}"
fi
for command_name in \
    emcc emconfigure emmake emcmake cmake curl tar sha256sum diff sed readlink \
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
  fail "TIFF rebuild needs at least ${MINIMUM_FREE_KIB} KiB free; ${available_kib} KiB is available."

run_privileged ln -s "${BUILD_ROOT}" /src
run_privileged ln -s "${OUTPUT_ROOT}" /out
cp "${SCRIPT_DIR}/build-libraries.sh" "${BUILD_ROOT}/build-libraries.sh"
cp "${SCRIPT_DIR}/build-module.sh" "${BUILD_ROOT}/build-module.sh"
cp "${SCRIPT_DIR}/within_tiff.c" "${BUILD_ROOT}/within_tiff.c"
chmod +x "${BUILD_ROOT}/build-libraries.sh" "${BUILD_ROOT}/build-module.sh"

cd "${BUILD_ROOT}"
curl --fail --location --retry 3 \
  "https://download.osgeo.org/libtiff/tiff-${LIBTIFF_VERSION}.tar.xz" \
  --output libtiff.tar.xz
printf '%s  %s\n' "${LIBTIFF_SHA256}" libtiff.tar.xz |
  sha256sum --check --strict
tar --extract --file libtiff.tar.xz
mv "tiff-${LIBTIFF_VERSION}" libtiff
rm -- libtiff.tar.xz

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

curl --fail --location --retry 3 \
  "https://github.com/libjpeg-turbo/libjpeg-turbo/releases/download/${LIBJPEG_TURBO_VERSION}/libjpeg-turbo-${LIBJPEG_TURBO_VERSION}.tar.gz" \
  --output libjpeg-turbo.tar.gz
printf '%s  %s\n' "${LIBJPEG_TURBO_SHA256}" libjpeg-turbo.tar.gz |
  sha256sum --check --strict
tar --extract --file libjpeg-turbo.tar.gz
mv "libjpeg-turbo-${LIBJPEG_TURBO_VERSION}" libjpeg-turbo
rm -- libjpeg-turbo.tar.gz

./build-libraries.sh
./build-module.sh

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
  fail "Non-Docker TIFF artifacts differ from the published engine."
fi
printf 'Exact non-Docker TIFF artifact comparison passed.\n'
