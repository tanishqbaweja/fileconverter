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

strip_general_core_only_profiles() {
  local source_path="${1:-${BUILD_ROOT}/within_remux.c}"
  local filtered_path="${source_path}.specialist"
  awk '
    /^[[:space:]]*#ifdef[[:space:]]+WITHIN_OGV_COPY[[:space:]]*$/ {
      if (skipping) exit 2
      skipping = 1
      depth = 1
      keeping_else = 0
      next
    }
    skipping {
      if ($0 ~ /^[[:space:]]*#if(n?def)?([[:space:]]|$)/) {
        depth++
        if (keeping_else) print
        next
      }
      if ($0 ~ /^[[:space:]]*#else([[:space:]]|$)/ && depth == 1) {
        keeping_else = 1
        next
      }
      if ($0 ~ /^[[:space:]]*#endif([[:space:]]|$)/) {
        depth--
        if (depth == 0) {
          skipping = 0
          keeping_else = 0
        } else if (keeping_else) {
          print
        }
        next
      }
      if (keeping_else) print
      next
    }
    { print }
    END {
      if (skipping || depth != 0) exit 3
    }
  ' "${source_path}" > "${filtered_path}" ||
    fail "Could not remove general-core-only OGV blocks for specialist builds."
  mv -- "${filtered_path}" "${source_path}"
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

verify_specialist_source_rewrites() {
  local verification_root
  local status=0
  mkdir -p "${WORK_ROOT}"
  verification_root="$(mktemp -d "${WORK_ROOT}/ffmpeg-source-rewrite-check.XXXXXX")"
  assert_work_path "${verification_root}"
  cp "${SCRIPT_DIR}/within_remux.c" "${verification_root}/"
  if strip_general_core_only_profiles "${verification_root}/within_remux.c" &&
      patch --reverse --directory="${verification_root}" --strip=3 \
        < "${SCRIPT_DIR}/patches/matroska-artwork-source.patch" &&
      patch --reverse --directory="${verification_root}" --strip=3 \
        < "${SCRIPT_DIR}/patches/audio-options-source.patch" &&
      patch --reverse --directory="${verification_root}" --strip=1 \
        < "${SCRIPT_DIR}/patches/direct-source-79e4db.patch"; then
    printf 'Specialist source-rewrite preflight passed.\n'
  else
    status=$?
  fi
  rm -rf -- "${verification_root}"
  return "${status}"
}

if [[ "${WITHIN_VERIFY_SOURCE_REWRITES_ONLY:-0}" == "1" ]]; then
  for command_name in awk mktemp patch; do
    require_command "${command_name}"
  done
  verify_specialist_source_rewrites
  exit 0
fi

[[ "$(uname -s)" == "Linux" ]] ||
  fail "The non-Docker FFmpeg reproduction path currently requires Linux."
if [[ -n "${EMSDK_NODE:-}" ]]; then
  [[ -x "${EMSDK_NODE}" ]] ||
    fail "EMSDK_NODE does not identify an executable: ${EMSDK_NODE}"
  export PATH="$(dirname "${EMSDK_NODE}"):${PATH}"
fi
for command_name in emcc emconfigure emmake emar emranlib emnm awk curl tar \
  sha256sum patch pkg-config make diff readlink node; do
  require_command "${command_name}"
done

assert_work_path "${BUILD_ROOT}"
assert_work_path "${OUTPUT_ROOT}"
[[ ! -e "${BUILD_ROOT}" ]] || fail "Build directory already exists: ${BUILD_ROOT}"
[[ ! -e "${OUTPUT_ROOT}" ]] || fail "Output directory already exists: ${OUTPUT_ROOT}"
[[ ! -e /src && ! -L /src ]] || fail "Refusing to replace existing /src"
[[ ! -e /out && ! -L /out ]] || fail "Refusing to replace existing /out"

verify_specialist_source_rewrites
mkdir -p "${WORK_ROOT}" "${BUILD_ROOT}" "${OUTPUT_ROOT}"
trap cleanup EXIT INT TERM
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
export WITHIN_CURRENT_WRAPPER_SOURCE_SHA256
WITHIN_CURRENT_WRAPPER_SOURCE_SHA256="$(sha256sum "${BUILD_ROOT}/within_remux.c" | awk '{print $1}')"
cp "${SCRIPT_DIR}/patches/amr-bounded-packets.patch" "${BUILD_ROOT}/"
cp "${SCRIPT_DIR}/patches/avi-bounded-index.patch" "${BUILD_ROOT}/"
cp "${SCRIPT_DIR}/patches/audio-options-source.patch" "${BUILD_ROOT}/"
cp "${SCRIPT_DIR}/patches/matroska-artwork-source.patch" "${BUILD_ROOT}/"
cp "${SCRIPT_DIR}/patches/direct-source-79e4db.patch" "${BUILD_ROOT}/"
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
patch --directory="${BUILD_ROOT}/ffmpeg" --strip=1 < avi-bounded-index.patch
(
  cd "${BUILD_ROOT}/ffmpeg"
  emmake make -j"$(nproc)"
  emmake make install
)
requested_core="${WITHIN_BUILD_CORE_FILTER:-all}"
if [[ "${requested_core}" == "all" || "${requested_core}" == "within-remux" ]]; then
  WITHIN_BUILD_CORE_FILTER=within-remux ./build-remux.sh
fi
if [[ "${requested_core}" != "within-remux" ]]; then
  # The bounded AVI muxer and AVI output support belong only to the general
  # core. The already-certified specialists predate both changes, so restore
  # their exact historical FFmpeg configure surface as well as the source.
  patch --reverse --directory="${BUILD_ROOT}/ffmpeg" --strip=1 \
    < avi-bounded-index.patch
  (
    cd "${BUILD_ROOT}/ffmpeg"
    emmake make distclean
  )
  WITHIN_ENABLE_AV1_PARSER=0 WITHIN_ENABLE_AVI_MUXER=0 ./build-libraries.sh
fi
if [[ "${requested_core}" == "all" ]]; then
  # General-core-only profiles are preprocessor-guarded, so removing those
  # blocks produces the same specialist translation unit while keeping the
  # historical reverse patches independent of new guarded source context.
  strip_general_core_only_profiles
  # Matroska attached-picture retention belongs only to the general remux core.
  # Remove it before rebuilding unchanged specialist cores.
  patch --reverse --directory="${BUILD_ROOT}" --strip=3 \
    < matroska-artwork-source.patch
  # The audio ABI belongs only to the general remux core. Revert that bounded
  # delta before reconstructing every already-certified video/direct core.
  patch --reverse --directory="${BUILD_ROOT}" --strip=3 \
    < audio-options-source.patch
  for video_core in within-mpeg4 within-webm within-vp9 within-webm-quality; do
    WITHIN_BUILD_CORE_FILTER="${video_core}" ./build-remux.sh
  done
  # The direct 10 GiB remux core is intentionally unchanged. Reconstruct its
  # exact certified wrapper only after the current video specialists build.
  patch --reverse --directory="${BUILD_ROOT}" --strip=1 \
    < direct-source-79e4db.patch
  WITHIN_BUILD_CORE_FILTER=within-direct ./build-remux.sh
elif [[ "${requested_core}" == "within-direct" ]]; then
  strip_general_core_only_profiles
  patch --reverse --directory="${BUILD_ROOT}" --strip=3 \
    < matroska-artwork-source.patch
  patch --reverse --directory="${BUILD_ROOT}" --strip=3 \
    < audio-options-source.patch
  patch --reverse --directory="${BUILD_ROOT}" --strip=1 \
    < direct-source-79e4db.patch
  WITHIN_BUILD_CORE_FILTER=within-direct ./build-remux.sh
elif [[ "${requested_core}" != "within-remux" ]]; then
  strip_general_core_only_profiles
  patch --reverse --directory="${BUILD_ROOT}" --strip=3 \
    < matroska-artwork-source.patch
  patch --reverse --directory="${BUILD_ROOT}" --strip=3 \
    < audio-options-source.patch
  WITHIN_BUILD_CORE_FILTER="${requested_core}" ./build-remux.sh
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
  fail "Non-Docker FFmpeg artifacts differ from the published engine."
fi
printf 'Exact non-Docker FFmpeg artifact comparison passed.\n'
