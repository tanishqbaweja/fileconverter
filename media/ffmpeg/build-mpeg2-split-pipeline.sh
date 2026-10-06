#!/usr/bin/env bash
set -euo pipefail
# Experimental artifacts only; never writes public/engines or existing cores.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
WORK_ROOT="${PROJECT_ROOT}/work"
BUILD_ROOT="${WORK_ROOT}/mpeg2-split-pipeline-build"
OUTPUT_ROOT="${WORK_ROOT}/mpeg2-split-pipeline-output"
ALLOCATOR_DIAGNOSTIC="${WITHIN_MPEG2_ALLOCATOR_DIAGNOSTIC:-0}"
[[ "${ALLOCATOR_DIAGNOSTIC}" == 0 || "${ALLOCATOR_DIAGNOSTIC}" == 1 ]] || exit 2
CANDIDATE_ALLOCATOR=dlmalloc
[[ "${CANDIDATE_ALLOCATOR}" == emmalloc || "${CANDIDATE_ALLOCATOR}" == dlmalloc ]] ||
  { echo 'Private MPEG2 allocator must be emmalloc or dlmalloc.' >&2; exit 2; }
[[ "${ALLOCATOR_DIAGNOSTIC}" == 0 || "${CANDIDATE_ALLOCATOR}" == emmalloc ]] ||
  { echo 'emmalloc-specific diagnostics cannot measure dlmalloc.' >&2; exit 2; }
FRAME_ALLOCATION_DIAGNOSTIC="${WITHIN_MPEG2_FRAME_ALLOCATION_DIAGNOSTIC:-0}"
[[ "${FRAME_ALLOCATION_DIAGNOSTIC}" == 0 || "${FRAME_ALLOCATION_DIAGNOSTIC}" == 1 ]] ||
  { echo 'Private scalar plane diagnostic must be 0 or 1.' >&2; exit 2; }
[[ "${FRAME_ALLOCATION_DIAGNOSTIC}" == 0 || "${ALLOCATOR_DIAGNOSTIC}" == 0 ]] ||
  { echo 'Plane and allocator diagnostics use separate event budgets; do not combine.' >&2; exit 2; }
CANDIDATE_DECODER_SET=wide
case "${CANDIDATE_DECODER_SET}" in
  wide) CANDIDATE_DECODER_FLAGS="--enable-decoder=h264,hevc,mpeg4,mpeg2video,theora,vp8,vp9" ;;
  hevc-mpeg4) CANDIDATE_DECODER_FLAGS="--enable-decoder=hevc,mpeg4" ;;
  *) echo 'Private MPEG2 decoder set must be wide or hevc-mpeg4.' >&2; exit 2 ;;
esac
[[ "${ALLOCATOR_DIAGNOSTIC}" == 0 && "${FRAME_ALLOCATION_DIAGNOSTIC}" == 0 ]] || exit 2
DIAGNOSTIC_LINK_FLAGS=()
if [[ "${ALLOCATOR_DIAGNOSTIC}" == 1 ]]; then
  DIAGNOSTIC_LINK_FLAGS=(-Wl,--wrap=avcodec_default_get_buffer2 -Wl,--wrap=av_refstruct_pool_get)
fi
[[ "$(uname -s)" == Linux ]] || { echo 'An activated Linux Emscripten SDK is required (no Docker).' >&2; exit 1; }
for command_name in emcc em++ emconfigure emmake emar emranlib emnm curl tar sha256sum make pkg-config node patch; do
  command -v "${command_name}" >/dev/null
done
[[ "$(emcc --version | head -1)" == *'6.0.4'* ]] || { echo 'Emscripten must be 6.0.4.' >&2; exit 1; }
[[ ! -e "${BUILD_ROOT}" && ! -e "${OUTPUT_ROOT}" ]] || { echo 'Candidate directories already exist.' >&2; exit 1; }
mkdir -p "${WORK_ROOT}"
available_kib="$(df -Pk "${WORK_ROOT}" | awk 'NR == 2 { print $4 }')"
[[ "${available_kib}" =~ ^[0-9]+$ ]] && (( available_kib >= 8388608 )) ||
  { echo 'Candidate build requires at least 8 GiB free.' >&2; exit 1; }
mkdir -p "${BUILD_ROOT}" "${OUTPUT_ROOT}"
cleanup() {
  local status=$?
  [[ "${BUILD_ROOT}" == "${PROJECT_ROOT}/work/mpeg2-split-pipeline-build" && ! -L "${BUILD_ROOT}" ]] || exit 2
  rm -rf -- "${BUILD_ROOT}"
  if [[ "${status}" != 0 ]]; then
    [[ "${OUTPUT_ROOT}" == "${PROJECT_ROOT}/work/mpeg2-split-pipeline-output" && ! -L "${OUTPUT_ROOT}" ]] || exit 2
    rm -rf -- "${OUTPUT_ROOT}"
  fi
  exit "${status}"
}
trap cleanup EXIT
trap 'exit 130' INT TERM
export TMPDIR="${BUILD_ROOT}/tmp"
export EM_CACHE="${BUILD_ROOT}/emscripten-cache"
export EMCC_CORES=4
mkdir -p "${TMPDIR}" "${EM_CACHE}"
printf '{"type":"commonjs"}\n' > "${BUILD_ROOT}/package.json"
PREFIX="${BUILD_ROOT}/install"
export PKG_CONFIG_LIBDIR="${PREFIX}/lib/pkgconfig"
export PKG_CONFIG_PATH=
# emconfigure overwrites PKG_CONFIG_LIBDIR/PATH; its documented bridge reads
# EM_PKG_CONFIG_PATH. Keep our Wasm-only dependency discoverable, never host libs.
export EM_PKG_CONFIG_PATH="${PREFIX}/lib/pkgconfig"
download() {
  curl --fail --location --retry 3 "$1" --output "$2"
  printf '%s  %s\n' "$3" "$2" | sha256sum --check --strict
}
cd "${BUILD_ROOT}"
download https://ffmpeg.org/releases/ffmpeg-8.1.2.tar.xz ffmpeg.tar.xz \
  464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c
tar -xf ffmpeg.tar.xz
mv ffmpeg-8.1.2 ffmpeg
printf '%s  %s\n' 510df38d806692997594df40a2f587d55984a147e610c7546cfd749116dc264e \
  ffmpeg/libavformat/matroskaenc.c | sha256sum --check --strict
patch --fuzz=0 --directory=ffmpeg --strip=1 \
  < "${SCRIPT_DIR}/patches/matroska-bounded-no-cues.patch"
printf '%s  %s\n' d7aa80a99efecf757100dbd6d9d7adb84d263cbeed0603873206975405907068 \
  ffmpeg/libavformat/movenc.c | sha256sum --check --strict
patch --fuzz=0 --directory=ffmpeg --strip=1 \
  < "${SCRIPT_DIR}/patches/mov-fragmented-cover-metadata-only.patch"
patch --fuzz=0 --directory=ffmpeg --strip=1 \
  < "${SCRIPT_DIR}/patches/mov-bounded-custom-metadata.patch"
printf '%s  %s\n' e2d80222a7e8f4c42257540ed9ea011c6a8be7ac447cbf4ed60dae758319f509 \
  ffmpeg/libavformat/movenc.c | sha256sum --check --strict
patch --fuzz=0 --directory=ffmpeg --strip=1 \
  < "${SCRIPT_DIR}/patches/mov-fragmented-aac-exact-priming.patch"
printf '%s  %s\n' f93e901eef7867d56373d07afc32237e051f28cf64b2d9a0bca2474a36c0fcad \
  ffmpeg/libavformat/movenc.c | sha256sum --check --strict
# Private allocation policy only: preserve every upstream layout calculation,
# live frame reference and decoder pool; release inactive encoder planes.
printf '%s  %s\n' 38efe5e7fc627437306290919c8de3e2de5817d611b29d1f98e7ee6c12a8fb19 \
  ffmpeg/libavcodec/get_buffer.c | sha256sum --check --strict
patch --fuzz=0 --directory=ffmpeg --strip=1 \
  < "${SCRIPT_DIR}/patches/mpeg2-encoder-uncached-frame-buffers.patch"
printf '%s  %s\n' 62a73fe537318e4706f25904022d071e8f8ef9535b5334bf5c7b650e572c0478 \
  ffmpeg/libavcodec/get_buffer.c | sha256sum --check --strict
# Follow-up private cache policy: HEVC pixel planes only. Live decode reference
# lifetimes, auxiliary reference pools and every other decoder remain upstream.
patch --fuzz=0 --directory=ffmpeg --strip=1 \
  < "${SCRIPT_DIR}/patches/hevc-decoder-uncached-frame-buffers.patch"
printf '%s  %s\n' 910da6292a78066b114da7d26c7c1684969022960efc8becf116dc2b5acc4ab4 \
  ffmpeg/libavcodec/get_buffer.c | sha256sum --check --strict
if [[ "${FRAME_ALLOCATION_DIAGNOSTIC}" == 1 ]]; then
  # Scalar observer independent of emmalloc/dlmalloc; exact source reversal.
  node "${SCRIPT_DIR}/mpeg2-frame-allocation-diagnostic.mjs" \
    "${BUILD_ROOT}/ffmpeg/libavcodec/get_buffer.c"
  # Reversible pre/post pool-get and encoder inventory, shared48 scalar budget.
  printf '%s  %s\n' 340d160758ec36928907132618c0d989a0f09869cca5fe57ab936ad54a9a3e5e \
    ffmpeg/libavcodec/hevc/refs.c | sha256sum --check --strict
  node "${SCRIPT_DIR}/mpeg2-hevc-pool-attempt-diagnostic.mjs" \
    "${BUILD_ROOT}/ffmpeg/libavcodec/hevc/refs.c"
fi
# Private single-thread MPEG2 encoder accessory policy. Only final-reference
# return skips the idle cache; live objects, reset/free callbacks and decoders
# remain unchanged. The reserved bit is disjoint from pinned upstream flags.
printf '%s  %s\n' d8936c56db57fe53d9836e950563483104670c2fc98687f87fb497e078ba742f \
  ffmpeg/libavutil/refstruct.c | sha256sum --check --strict
printf '%s  %s\n' 8e7be80109d14fce52e3de7a30932efea283abe963ccdd755787e219a4699b19 \
  ffmpeg/libavutil/refstruct.h | sha256sum --check --strict
printf '%s  %s\n' 80e1e8455035bd95de6fd051d54a4814db5c791811757cfaaaba16f422595ca4 \
  ffmpeg/libavcodec/mpegvideo.c | sha256sum --check --strict
patch --fuzz=0 --directory=ffmpeg --strip=1 \
  < "${SCRIPT_DIR}/patches/mpeg2-encoder-uncached-accessories.patch"
printf '%s  %s\n' e31af1df1e6e7b60b9112e2fcd22917664bc365d65db6c1d2b7038f5d532e084 \
  ffmpeg/libavutil/refstruct.c | sha256sum --check --strict
printf '%s  %s\n' 4a2b2d1db11b794c3b8f4963e31cfb23124d09cdf8f0d6998037cbf344b45d9f \
  ffmpeg/libavcodec/mpegvideo.c | sha256sum --check --strict
# Actual measured idle backing justifies a private two-pool HEVC trial.
# Reuse bit30 final-reference admission only; never alter live refs or sizes.
node "${SCRIPT_DIR}/mpeg2-hevc-auxiliary-policy.mjs" \
  "${BUILD_ROOT}/ffmpeg/libavcodec/hevc/hevcdec.c"
cp "${SCRIPT_DIR}/mpeg2-hevc-auxiliary-policy.h" \
  ffmpeg/libavcodec/hevc/mpeg2-hevc-auxiliary-policy.h
if [[ "${ALLOCATOR_DIAGNOSTIC}" == 1 || "${FRAME_ALLOCATION_DIAGNOSTIC}" == 1 ]]; then
  # Read-only private pool telemetry atop the independently pinned policy.
  printf '%s  %s\n' e31af1df1e6e7b60b9112e2fcd22917664bc365d65db6c1d2b7038f5d532e084 \
    ffmpeg/libavutil/refstruct.c | sha256sum --check --strict
  patch --fuzz=0 --directory=ffmpeg --strip=1 \
    < "${SCRIPT_DIR}/patches/refstruct-readonly-pool-diagnostic.patch"
  printf '%s  %s\n' 616af42245394f1db14d872554545d83759c6d5889292fdf8e4223ee244633f1 \
    ffmpeg/libavutil/refstruct.c | sha256sum --check --strict
fi
if [[ "${ALLOCATOR_DIAGNOSTIC}" == 1 ]]; then
  # Scalar accessor inventory after normal encoder picture release only.
  printf '%s  %s\n' 17eddac164020668201e0b6d25140cf1328db6ba953559587240d8c73199289f \
    ffmpeg/libavcodec/mpegvideo_enc.c | sha256sum --check --strict
  patch --fuzz=0 --directory=ffmpeg --strip=1 \
    < "${SCRIPT_DIR}/patches/mpeg2-encoder-pool-release-diagnostic.patch"
  printf '%s  %s\n' 2b16624607a83d6842d35ae053f3a542de82c84b72e7371bdadc6c6b5db9fb57 \
    ffmpeg/libavcodec/mpegvideo_enc.c | sha256sum --check --strict
fi
(
  cd ffmpeg
  trap 'status=$?; if [[ -f ffbuild/config.log ]]; then tail -n 120 ffbuild/config.log >&2; fi; exit "${status}"' ERR
  emconfigure ./configure --prefix="${PREFIX}" --cc=emcc --cxx=em++ \
    --ar=emar --ranlib=emranlib --nm=emnm --arch=wasm --target-os=none \
    --disable-everything --disable-autodetect --disable-programs --disable-doc \
    --disable-debug --disable-network --disable-devices --disable-avdevice \
    --disable-avfilter --disable-iconv --disable-zlib --disable-bzlib \
    --disable-lzma --disable-asm --disable-runtime-cpudetect --enable-pthreads \
    --enable-avformat --enable-avcodec --enable-avutil \
    --enable-swscale --disable-swresample --pkg-config=pkg-config --pkg-config-flags=--static \
    --enable-demuxer=matroska,mov,avi,mpegts,mpegvideo,h264,m4v,ogg,flv,ivf \
    --enable-muxer=mp4,matroska \
    "${CANDIDATE_DECODER_FLAGS}" \
    --enable-parser=h264,hevc,mpeg4video,mpegvideo,vp8,vp9,aac,mpegaudio,flac,vorbis,opus \
    --enable-bsf=aac_adtstoasc,h264_mp4toannexb,hevc_mp4toannexb,extract_extradata \
    --extra-cflags="-O3 -fno-math-errno -msimd128 -pthread -I${PREFIX}/include" \
    --extra-ldflags="-O3 -pthread -L${PREFIX}/lib"
  emmake make -j4
  emmake make install
)
# Compile the preserved production AVIO/kernel with the separate codec hooks.
node "${SCRIPT_DIR}/make-mpeg2-split-pipeline.mjs" "${BUILD_ROOT}/within_split_pipeline.c"
emcc "${BUILD_ROOT}/within_split_pipeline.c" -I"${PREFIX}/include" -I"${SCRIPT_DIR}" \
  "${PREFIX}/lib/libavformat.a" "${PREFIX}/lib/libavcodec.a" \
  "${PREFIX}/lib/libswscale.a" "${PREFIX}/lib/libavutil.a" \
  -O3 -flto -msimd128 -pthread --profiling-funcs --emit-symbol-map \
  -sPTHREAD_POOL_SIZE=0 -sPTHREAD_POOL_SIZE_STRICT=2 \
  -sASYNCIFY=1 -sASYNCIFY_STACK_SIZE=262144 \
  -sALLOW_MEMORY_GROWTH=0 -sINITIAL_MEMORY=33554432 -sMAXIMUM_MEMORY=33554432 \
  -sSTACK_SIZE=262144 -sSTACK_OVERFLOW_CHECK=2 -sMALLOC=dlmalloc -sMODULARIZE=1 -sEXPORT_ES6=1 \
  -sENVIRONMENT=worker -sFILESYSTEM=0 -sASSERTIONS=1 -sWASM_BIGINT=1 \
  -sEXPORTED_FUNCTIONS='["_within_remux","_emscripten_stack_get_base","_emscripten_stack_get_end"]' \
  -sEXPORTED_RUNTIME_METHODS='["ccall","HEAPU8"]' \
  -sASYNCIFY_IMPORTS='["within_input_read","within_output_write","within_output_rotate","within_output_truncate","within_output_flush"]' \
  -Wl,--no-entry -o "${OUTPUT_ROOT}/within-mpeg2-split.mjs"
cp ffmpeg/COPYING.LGPLv2.1 "${OUTPUT_ROOT}/LICENSE.ffmpeg"
cp ffmpeg/config_components.h "${OUTPUT_ROOT}/config_components.h"
# Actual separate encoder built unchanged; no Node frame encoding.
bash "${SCRIPT_DIR}/build-mpeg2-split-encoder.sh"
cp "${PROJECT_ROOT}/work/mpeg2-split-encoder-output/split-encoder.mjs" "${OUTPUT_ROOT}/"
cp "${PROJECT_ROOT}/work/mpeg2-split-encoder-output/split-encoder.wasm" "${OUTPUT_ROOT}/"
cp "${PROJECT_ROOT}/work/mpeg2-split-encoder-output/initialization-contract.json" "${OUTPUT_ROOT}/encoder-initialization.json"
node "${SCRIPT_DIR}/mpeg2-split-pipeline-manifest.mjs"
