#!/usr/bin/env bash
set -euo pipefail

# Rebuild the published FFmpeg Wasm modules with a pinned, already-activated
# Emscripten SDK. This script intentionally uses no container runtime. The
# legacy /src and /out paths are short-lived symlinks into repository-local
# work directories so the existing audited build recipes remain byte-stable.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORK_ROOT="${PROJECT_ROOT}/work"
BUILD_ROOT="${WORK_ROOT}/ffmpeg-nondocker-build"
OUTPUT_ROOT="${WORK_ROOT}/ffmpeg-nondocker-output"
EXPECTED_ROOT="${PROJECT_ROOT}/public/engines/remux"
KEEP_OUTPUT="${WITHIN_KEEP_NONDOCKER_OUTPUT:-0}"
MINIMUM_FREE_KIB="${WITHIN_MINIMUM_BUILD_FREE_KIB:-8388608}"

FFMPEG_VERSION=8.1.2
FFMPEG_SHA256=464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c
LIBVPX_VERSION=1.16.0
LIBVPX_SHA256=7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c
OPENCORE_AMR_VERSION=0.1.6
OPENCORE_AMR_SHA256=483eb4061088e2b34b358e47540b5d495a96cd468e361050fae615b1809dc4a1
LAME_VERSION=4.0
LAME_SHA256=3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb
OPUS_VERSION=1.6.1
OPUS_SHA256=6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1
LIBOGG_VERSION=1.3.6
LIBOGG_SHA256=5c8253428e181840cd20d41f3ca16557a9cc04bad4a3d04cce84808677fa1061
LIBVORBIS_VERSION=1.3.7
LIBVORBIS_SHA256=b33cc4934322bcbf6efcbacf49e3ca01aadbea4114ec9589d1b1e9d20f72954b

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
  rm -rf -- "${BUILD_ROOT}"
  if [[ "${KEEP_OUTPUT}" != "1" ]]; then
    rm -rf -- "${OUTPUT_ROOT}"
  fi
  exit "${status}"
}
trap cleanup EXIT INT TERM

download_and_extract() {
  local url="$1"
  local archive="$2"
  local expected_sha256="$3"
  local extracted_name="$4"
  local destination_name="$5"

  curl --fail --location --retry 3 "${url}" --output "${archive}"
  printf '%s  %s\n' "${expected_sha256}" "${archive}" |
    sha256sum --check --strict
  tar --extract --file "${archive}"
  mv "${extracted_name}" "${destination_name}"
  rm -- "${archive}"
}

run_build_step() {
  local script_path="$1"
  local source_directory="$2"
  if ! "${script_path}"; then
    if [[ -f "${source_directory}/config.log" ]]; then
      printf 'Configure diagnostics from %s:\n' \
        "${source_directory}/config.log" >&2
      grep -n -E \
        'conftest|cannot run|Permission denied|not found|Exec format|SyntaxError|Error:' \
        "${source_directory}/config.log" | tail -n 160 >&2 || true
      printf 'End of configure log:\n' >&2
      tail -n 40 "${source_directory}/config.log" >&2
    fi
    fail "Build step failed: ${script_path}"
  fi
}

[[ "$(uname -s)" == "Linux" ]] ||
  fail "The non-Docker FFmpeg reproduction path currently requires Linux."
if [[ -n "${EMSDK_NODE:-}" ]]; then
  [[ -x "${EMSDK_NODE}" ]] ||
    fail "EMSDK_NODE does not identify an executable: ${EMSDK_NODE}"
  export PATH="$(dirname "${EMSDK_NODE}"):${PATH}"
fi
for command_name in emcc emconfigure emmake emar emranlib emnm curl tar \
  sha256sum patch pkg-config make diff readlink node; do
  require_command "${command_name}"
done

assert_work_path "${BUILD_ROOT}"
assert_work_path "${OUTPUT_ROOT}"
[[ ! -e "${BUILD_ROOT}" ]] || fail "Build directory already exists: ${BUILD_ROOT}"
[[ ! -e "${OUTPUT_ROOT}" ]] || fail "Output directory already exists: ${OUTPUT_ROOT}"
[[ ! -e /src && ! -L /src ]] || fail "Refusing to replace existing /src"
[[ ! -e /out && ! -L /out ]] || fail "Refusing to replace existing /out"

mkdir -p "${WORK_ROOT}" "${BUILD_ROOT}" "${OUTPUT_ROOT}"
# Emscripten's Autoconf probes are extensionless CommonJS programs. Keep the
# repository's top-level `type: module` package scope from changing their Node
# interpretation; the original isolated /src build has the same boundary.
printf '{"type":"commonjs"}\n' > "${BUILD_ROOT}/package.json"
available_kib="$(df -Pk "${WORK_ROOT}" | awk 'NR == 2 { print $4 }')"
[[ "${available_kib}" =~ ^[0-9]+$ ]] || fail "Could not determine free disk space."
(( available_kib >= MINIMUM_FREE_KIB )) ||
  fail "FFmpeg rebuild needs at least ${MINIMUM_FREE_KIB} KiB free; ${available_kib} KiB is available."

run_privileged ln -s "${BUILD_ROOT}" /src
run_privileged ln -s "${OUTPUT_ROOT}" /out

cp "${SCRIPT_DIR}"/build-*.sh "${BUILD_ROOT}/"
cp "${SCRIPT_DIR}/wasm-pkg-config.sh" "${BUILD_ROOT}/"
cp "${SCRIPT_DIR}/within_remux.c" "${BUILD_ROOT}/"
cp "${SCRIPT_DIR}/patches/amr-bounded-packets.patch" "${BUILD_ROOT}/"
chmod +x "${BUILD_ROOT}"/*.sh

cd "${BUILD_ROOT}"
download_and_extract \
  "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" \
  ffmpeg.tar.xz "${FFMPEG_SHA256}" "ffmpeg-${FFMPEG_VERSION}" ffmpeg
download_and_extract \
  "https://github.com/webmproject/libvpx/archive/refs/tags/v${LIBVPX_VERSION}.tar.gz" \
  libvpx.tar.gz "${LIBVPX_SHA256}" "libvpx-${LIBVPX_VERSION}" libvpx
download_and_extract \
  "https://downloads.sourceforge.net/project/opencore-amr/opencore-amr/opencore-amr-${OPENCORE_AMR_VERSION}.tar.gz" \
  opencore-amr.tar.gz "${OPENCORE_AMR_SHA256}" \
  "opencore-amr-${OPENCORE_AMR_VERSION}" opencore-amr
download_and_extract \
  "https://downloads.sourceforge.net/project/lame/lame/${LAME_VERSION}/lame-${LAME_VERSION}.tar.gz" \
  lame.tar.gz "${LAME_SHA256}" "lame-${LAME_VERSION}" lame
download_and_extract \
  "https://ftp.osuosl.org/pub/xiph/releases/opus/opus-${OPUS_VERSION}.tar.gz" \
  opus.tar.gz "${OPUS_SHA256}" "opus-${OPUS_VERSION}" opus
download_and_extract \
  "https://downloads.xiph.org/releases/ogg/libogg-${LIBOGG_VERSION}.tar.xz" \
  libogg.tar.xz "${LIBOGG_SHA256}" "libogg-${LIBOGG_VERSION}" libogg
download_and_extract \
  "https://downloads.xiph.org/releases/vorbis/libvorbis-${LIBVORBIS_VERSION}.tar.xz" \
  libvorbis.tar.xz "${LIBVORBIS_SHA256}" \
  "libvorbis-${LIBVORBIS_VERSION}" libvorbis

./build-vpx.sh
run_build_step ./build-opencore-amr.sh "${BUILD_ROOT}/opencore-amr"
run_build_step ./build-lame.sh "${BUILD_ROOT}/lame"
run_build_step ./build-opus.sh "${BUILD_ROOT}/opus"
run_build_step ./build-ogg.sh "${BUILD_ROOT}/libogg"
run_build_step ./build-vorbis.sh "${BUILD_ROOT}/libvorbis"
patch --directory="${BUILD_ROOT}/ffmpeg" --strip=1 < amr-bounded-packets.patch
./build-libraries.sh
WITHIN_BUILD_CORE_FILTER="${WITHIN_BUILD_CORE_FILTER:-all}" ./build-remux.sh

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
  fail "Non-Docker FFmpeg artifacts differ from the published engine."
fi
printf 'Exact non-Docker FFmpeg artifact comparison passed.\n'
