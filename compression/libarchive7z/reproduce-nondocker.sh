#!/usr/bin/env bash
set -euo pipefail

# Rebuild the published 7Z Wasm engine with an already-activated, pinned
# Emscripten SDK. Canonical /src and /out paths are temporary symlinks into
# repository-local, ownership-tracked scratch directories.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORK_ROOT="${PROJECT_ROOT}/work"
BUILD_ROOT="${WORK_ROOT}/archive7z-nondocker-build"
OUTPUT_ROOT="${WORK_ROOT}/archive7z-nondocker-output"
EXPECTED_ROOT="${PROJECT_ROOT}/public/engines/archive7z"
KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"
MINIMUM_FREE_KIB="${WITHIN_MINIMUM_BUILD_FREE_KIB:-2097152}"
BUILD_ROOT_CREATED=0
OUTPUT_ROOT_CREATED=0

LIBARCHIVE_VERSION=3.8.9
LIBARCHIVE_SHA256=888c934f9d95648ecb9163dc8e23ab80a476ecb81a8f1154704a227b5b676dde
XZ_VERSION=5.8.3
XZ_SHA256=fff1ffcf2b0da84d308a14de513a1aa23d4e9aa3464d17e64b9714bfdd0bbfb6

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
  fail "The non-Docker 7Z reproduction path currently requires Linux."
if [[ -n "${EMSDK_NODE:-}" ]]; then
  [[ -x "${EMSDK_NODE}" ]] ||
    fail "EMSDK_NODE does not identify an executable: ${EMSDK_NODE}"
  export PATH="$(dirname "${EMSDK_NODE}"):${PATH}"
fi
for command_name in \
    emcc emconfigure emmake curl tar sha256sum diff sed readlink awk find sort \
    xargs df nproc make patch; do
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
  fail "7Z rebuild needs at least ${MINIMUM_FREE_KIB} KiB free; ${available_kib} KiB is available."

run_privileged ln -s "${BUILD_ROOT}" /src
run_privileged ln -s "${OUTPUT_ROOT}" /out
cp "${SCRIPT_DIR}/build-libraries.sh" "${BUILD_ROOT}/build-libraries.sh"
cp "${SCRIPT_DIR}/build-module.sh" "${BUILD_ROOT}/build-module.sh"
cp "${SCRIPT_DIR}/libarchive-7zip-opfs.patch" "${BUILD_ROOT}/libarchive-7zip-opfs.patch"
cp "${SCRIPT_DIR}/within_archive_temp_bridge.h" "${BUILD_ROOT}/within_archive_temp_bridge.h"
cp "${SCRIPT_DIR}/within_archive7z.c" "${BUILD_ROOT}/within_archive7z.c"
chmod +x "${BUILD_ROOT}/build-libraries.sh" "${BUILD_ROOT}/build-module.sh"

cd "${BUILD_ROOT}"
curl --fail --location --retry 3 \
  "https://github.com/libarchive/libarchive/releases/download/v${LIBARCHIVE_VERSION}/libarchive-${LIBARCHIVE_VERSION}.tar.xz" \
  --output libarchive.tar.xz
printf '%s  %s\n' "${LIBARCHIVE_SHA256}" libarchive.tar.xz |
  sha256sum --check --strict
tar --extract --file libarchive.tar.xz
mv "libarchive-${LIBARCHIVE_VERSION}" libarchive
rm -- libarchive.tar.xz

curl --fail --location --retry 3 \
  "https://github.com/tukaani-project/xz/releases/download/v${XZ_VERSION}/xz-${XZ_VERSION}.tar.xz" \
  --output xz.tar.xz
printf '%s  %s\n' "${XZ_SHA256}" xz.tar.xz |
  sha256sum --check --strict
tar --extract --file xz.tar.xz
mv "xz-${XZ_VERSION}" xz
rm -- xz.tar.xz

(
  cd libarchive
  patch -p1 < "${BUILD_ROOT}/libarchive-7zip-opfs.patch"
)
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
  fail "Non-Docker archive7z artifacts differ from the published engine."
fi
printf 'Exact non-Docker archive7z artifact comparison passed.\n'
