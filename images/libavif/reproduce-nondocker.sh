#!/usr/bin/env bash
set -euo pipefail

# Rebuild one published AVIF Wasm variant with a pinned, activated Emscripten
# SDK. Canonical /src and /out paths are temporary symlinks into repository-local
# scratch roots owned by this invocation.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
ENCODER_DIR="${PROJECT_ROOT}/images/libavif-encoder"
WORK_ROOT="${PROJECT_ROOT}/work"
VARIANT="${1:-}"
KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"
MINIMUM_FREE_KIB="${WITHIN_MINIMUM_BUILD_FREE_KIB:-6291456}"

LIBAVIF_VERSION=1.4.1
LIBAVIF_COMMIT=6543b22b5bc706c53f038a16fe515f921556d9b3
LIBAVIF_SHA256=d4aea31a4becb3273ba7968221be2e48148ba05eb8a68d14e671963e17785648
LIBAOM_COMMIT=ad44980d7f3c7a2605c25d51ea96946949000841
FFMPEG_VERSION=8.1.2
FFMPEG_SHA256=464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c
LIBPNG_VERSION=1.6.58
LIBPNG_SHA256=28eb403f51f0f7405249132cecfe82ea5c0ef97f1b32c5a65828814ae0d34775
ZLIB_VERSION=1.3.2
ZLIB_SHA256=d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3
EMSCRIPTEN_VERSION=6.0.4

case "${VARIANT}" in
  decoder) ENGINE_ID=avif ;;
  encoder) ENGINE_ID=avif-encoder ;;
  *) printf 'Usage: %s decoder|encoder\n' "$0" >&2; exit 2 ;;
esac

BUILD_ROOT="${WORK_ROOT}/${ENGINE_ID}-nondocker-build"
OUTPUT_ROOT="${WORK_ROOT}/${ENGINE_ID}-nondocker-output"
EXPECTED_ROOT="${PROJECT_ROOT}/public/engines/${ENGINE_ID}"
BUILD_ROOT_CREATED=0
OUTPUT_ROOT_CREATED=0
PINNED_EMSDK_ROOT="${EMSDK:-}"
PINNED_EMSDK_MARKER=.within-fileconverter-owner
PINNED_EMSDK_MOVED=0
PINNED_EMSDK_BOOTSTRAP_CREATED=0

fail() { printf '%s\n' "$*" >&2; exit 1; }
require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "Required command is unavailable: $1"
}
run_privileged() {
  if [[ "$(id -u)" == "0" ]]; then "$@"; else sudo "$@"; fi
}
assert_work_path() {
  case "$1" in "${WORK_ROOT}"/*) ;; *) fail "Refusing non-repository build path: $1" ;; esac
}
remove_owned_symlink() {
  local link_path="$1" expected_target="$2"
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
restore_owned_emsdk() {
  if [[ "${PINNED_EMSDK_MOVED}" != "1" ]]; then return; fi
  if [[ ! -d /emsdk || -L /emsdk ]]; then
    printf 'Cannot restore the owned SDK because /emsdk is not the expected directory.\n' >&2
    return
  fi
  local recorded_owner
  recorded_owner="$(run_privileged cat "/emsdk/${PINNED_EMSDK_MARKER}" 2>/dev/null || true)"
  if [[ "${recorded_owner}" != "${PINNED_EMSDK_ROOT}" || -e "${PINNED_EMSDK_ROOT}" ]]; then
    printf 'Leaving unexpected /emsdk directory untouched.\n' >&2
    return
  fi
  run_privileged mv /emsdk "${PINNED_EMSDK_ROOT}"
  rm -- "${PINNED_EMSDK_ROOT}/${PINNED_EMSDK_MARKER}"
  PINNED_EMSDK_MOVED=0
}
cleanup() {
  local status=$?
  remove_owned_symlink /src "${BUILD_ROOT}"
  remove_owned_symlink /out "${OUTPUT_ROOT}"
  if [[ "${PINNED_EMSDK_MOVED}" == "1" && \
      "${PINNED_EMSDK_BOOTSTRAP_CREATED}" == "1" ]]; then
    run_privileged rm -f -- /emsdk/hello.c /emsdk/hello.o
  fi
  restore_owned_emsdk
  if [[ "${BUILD_ROOT_CREATED}" == "1" ]]; then rm -rf -- "${BUILD_ROOT}"; fi
  if [[ "${OUTPUT_ROOT_CREATED}" == "1" && "${KEEP_OUTPUT}" != "1" ]]; then
    rm -rf -- "${OUTPUT_ROOT}"
  fi
  exit "${status}"
}
trap cleanup EXIT INT TERM

[[ "$(uname -s)" == "Linux" ]] ||
  fail "The non-Docker AVIF reproduction path currently requires Linux."
if [[ -n "${EMSDK_NODE:-}" ]]; then
  [[ -x "${EMSDK_NODE}" ]] || fail "EMSDK_NODE is not executable: ${EMSDK_NODE}"
  export PATH="$(dirname "${EMSDK_NODE}"):${PATH}"
fi
for command_name in \
    emcc emconfigure emmake emcmake cmake git curl tar sha256sum diff sed \
    readlink awk find sort xargs df nproc make patch pkg-config cut; do
  require_command "${command_name}"
done
if [[ "$(id -u)" != "0" ]]; then require_command sudo; fi

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
  fail "AVIF rebuild needs at least ${MINIMUM_FREE_KIB} KiB free; ${available_kib} KiB is available."

run_privileged ln -s "${BUILD_ROOT}" /src
run_privileged ln -s "${OUTPUT_ROOT}" /out
if [[ "${VARIANT}" == "encoder" ]]; then
  [[ -n "${PINNED_EMSDK_ROOT}" && -d "${PINNED_EMSDK_ROOT}" ]] ||
    fail "The activated EMSDK root is unavailable."
  assert_work_path "${PINNED_EMSDK_ROOT}"
  [[ ! -e /emsdk && ! -L /emsdk ]] || fail "Refusing to replace existing /emsdk"
  printf '%s\n' "${PINNED_EMSDK_ROOT}" > \
    "${PINNED_EMSDK_ROOT}/${PINNED_EMSDK_MARKER}"
  # AOM and LLVM embed their canonical toolchain identity. Temporarily moving
  # the owned SDK to the published build's physical path prevents Python and
  # LLVM from resolving a symlink back to a runner-specific workspace path.
  run_privileged mv "${PINNED_EMSDK_ROOT}" /emsdk
  PINNED_EMSDK_MOVED=1
  export EMSDK=/emsdk
  unset EMSDK_NODE
  PINNED_EMSDK_BOOTSTRAP_CREATED=1
  (
    cd /emsdk
    ./emsdk activate "${EMSCRIPTEN_VERSION}" >/dev/null
    printf 'int main() { return 0; }\n' > hello.c
    ./upstream/emscripten/emcc -c hello.c
    rm -- hello.c hello.o
  )
  PINNED_EMSDK_BOOTSTRAP_CREATED=0
  source /emsdk/emsdk_env.sh >/dev/null
fi
cd "${BUILD_ROOT}"

curl --fail --location --retry 3 \
  "https://github.com/AOMediaCodec/libavif/archive/refs/tags/v${LIBAVIF_VERSION}.tar.gz" \
  --output libavif.tar.gz
printf '%s  %s\n' "${LIBAVIF_SHA256}" libavif.tar.gz | sha256sum --check --strict
tar --extract --file libavif.tar.gz
mv "libavif-${LIBAVIF_VERSION}" libavif
rm -- libavif.tar.gz
remote_commit="$(git ls-remote https://github.com/AOMediaCodec/libavif.git \
  "refs/tags/v${LIBAVIF_VERSION}^{}" | cut -f1)"
[[ "${remote_commit}" == "${LIBAVIF_COMMIT}" ]] || fail "libavif tag commit differs."

git clone --filter=blob:none --no-checkout \
  https://aomedia.googlesource.com/aom.git libavif/ext/aom
git -C libavif/ext/aom checkout "${LIBAOM_COMMIT}"
[[ "$(git -C libavif/ext/aom rev-parse HEAD)" == "${LIBAOM_COMMIT}" ]] ||
  fail "libaom checkout does not match the pinned commit."

curl --fail --location --retry 3 \
  "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" \
  --output ffmpeg.tar.xz
printf '%s  %s\n' "${FFMPEG_SHA256}" ffmpeg.tar.xz | sha256sum --check --strict
tar --extract --file ffmpeg.tar.xz
mv "ffmpeg-${FFMPEG_VERSION}" ffmpeg
rm -- ffmpeg.tar.xz
mkdir -p wrapper

if [[ "${VARIANT}" == "decoder" ]]; then
  curl --fail --location --retry 3 \
    "https://download.sourceforge.net/libpng/libpng-${LIBPNG_VERSION}.tar.xz" \
    --output libpng.tar.xz
  printf '%s  %s\n' "${LIBPNG_SHA256}" libpng.tar.xz | sha256sum --check --strict
  tar --extract --file libpng.tar.xz
  mv "libpng-${LIBPNG_VERSION}" libpng
  rm -- libpng.tar.xz
  curl --fail --location --retry 3 \
    "https://zlib.net/zlib-${ZLIB_VERSION}.tar.xz" --output zlib.tar.xz
  printf '%s  %s\n' "${ZLIB_SHA256}" zlib.tar.xz | sha256sum --check --strict
  tar --extract --file zlib.tar.xz
  mv "zlib-${ZLIB_VERSION}" zlib
  rm -- zlib.tar.xz

  cp "${SCRIPT_DIR}/build-libraries.sh" build-libraries.sh
  cp "${SCRIPT_DIR}/build-ffmpeg.sh" build-ffmpeg.sh
  cp "${SCRIPT_DIR}/build-module.sh" build-module.sh
  cp "${SCRIPT_DIR}/CMakeLists.txt" wrapper/CMakeLists.txt
  cp "${SCRIPT_DIR}/within_avif.c" wrapper/within_avif.c
  chmod +x build-libraries.sh build-ffmpeg.sh build-module.sh
  ./build-libraries.sh
  ./build-ffmpeg.sh
  ./build-module.sh
else
  cp "${ENCODER_DIR}/ffmpeg-avif-streaming.patch" ffmpeg-avif-streaming.patch
  patch --directory=ffmpeg --strip=1 \
    --input="${BUILD_ROOT}/ffmpeg-avif-streaming.patch"
  cp "${ENCODER_DIR}/build-aom.sh" build-aom.sh
  cp "${ENCODER_DIR}/build-ffmpeg.sh" build-ffmpeg.sh
  cp "${ENCODER_DIR}/build-module.sh" build-module.sh
  cp "${ENCODER_DIR}/CMakeLists.txt" wrapper/CMakeLists.txt
  cp "${ENCODER_DIR}/within_avif_encode.c" wrapper/within_avif_encode.c
  chmod +x build-aom.sh build-ffmpeg.sh build-module.sh
  ./build-aom.sh
  ./build-ffmpeg.sh
  ./build-module.sh
fi

if ! diff --recursive --brief --no-dereference \
    "${EXPECTED_ROOT}" "${OUTPUT_ROOT}"; then
  printf 'Expected artifact hashes:\n' >&2
  (cd "${EXPECTED_ROOT}"; find . -type f -print0 | sort -z | xargs -0 sha256sum) >&2
  printf 'Rebuilt artifact hashes:\n' >&2
  (cd "${OUTPUT_ROOT}"; find . -type f -print0 | sort -z | xargs -0 sha256sum) >&2
  fail "Non-Docker ${ENGINE_ID} artifacts differ from the published engine."
fi
printf 'Exact non-Docker %s artifact comparison passed.\n' "${ENGINE_ID}"
