#!/usr/bin/env bash
set -euo pipefail

PREFIX=/src/install
OUTPUT=/out

mkdir -p "${OUTPUT}"

build_core() {
  local output_name="$1"
  local video_threads="$2"
  local pthread_pool_size="$3"
  local threaded_mpeg4="${4:-0}"
  local output_buffer_bytes="${5:-262144}"
  local profile_defines=()
  if [[ "${threaded_mpeg4}" == "1" ]]; then
    profile_defines+=("-DWITHIN_MPEG4_THREADED=1")
  fi

  emcc /src/within_remux.c \
    -DWITHIN_VIDEO_THREADS="${video_threads}" \
    -DWITHIN_AVIO_OUTPUT_BUFFER_SIZE="${output_buffer_bytes}" \
    "${profile_defines[@]}" \
    -I"${PREFIX}/include" \
    "${PREFIX}/lib/libavformat.a" \
    "${PREFIX}/lib/libavcodec.a" \
    "${PREFIX}/lib/libswresample.a" \
    "${PREFIX}/lib/libswscale.a" \
    "${PREFIX}/lib/libavutil.a" \
    "${PREFIX}/lib/libvpx.a" \
    -O3 \
    -flto \
    -msimd128 \
    -pthread \
    -sPTHREAD_POOL_SIZE="${pthread_pool_size}" \
    -sPTHREAD_POOL_SIZE_STRICT=2 \
    -sASYNCIFY=1 \
    -sASYNCIFY_STACK_SIZE=1048576 \
    -sALLOW_MEMORY_GROWTH=1 \
    -sINITIAL_MEMORY=33554432 \
    -sMAXIMUM_MEMORY=100663296 \
    -sMEMORY_GROWTH_LINEAR_STEP=8388608 \
    -sSTACK_SIZE=1048576 \
    -sMALLOC=emmalloc \
    -sMODULARIZE=1 \
    -sEXPORT_ES6=1 \
    -sENVIRONMENT=worker \
    -sEXPORT_NAME=createWithinRemuxCore \
    -sFILESYSTEM=0 \
    -sASSERTIONS=0 \
    -sWASM_BIGINT=1 \
    -sEXPORTED_FUNCTIONS='["_within_remux"]' \
    -sEXPORTED_RUNTIME_METHODS='["ccall"]' \
    -sASYNCIFY_IMPORTS='["within_input_read","within_output_write","within_output_truncate","within_output_flush"]' \
    -Wl,--no-entry \
    -o "${OUTPUT}/${output_name}.mjs"
}

build_core within-remux 1 0 0
build_core within-direct 1 0 0 1048576
build_core within-mpeg4 2 4 1
build_core within-webm 4 8 0

cat > "${OUTPUT}/build-manifest.json" <<EOF
{
  "engine": "within-remux",
  "ffmpegVersion": "8.1.2",
  "ffmpegSourceSha256": "464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c",
  "libvpxVersion": "1.16.0",
  "libvpxSourceSha256": "7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c",
  "emscriptenImage": "emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b",
  "licenses": ["FFmpeg LGPL-2.1-or-later", "libvpx BSD-3-Clause"],
  "initialWasmMemoryBytes": 33554432,
  "maximumWasmMemoryBytes": 100663296,
  "modules": [
    {"name": "within-remux", "wasmPthreadPoolSize": 0, "videoCodecThreads": 1, "profiles": ["stream-copy", "audio"]},
    {"name": "within-direct", "wasmPthreadPoolSize": 0, "videoCodecThreads": 1, "avioOutputBufferBytes": 1048576, "profiles": ["mkv-to-mp4-direct-save"]},
    {"name": "within-mpeg4", "wasmPthreadPoolSize": 4, "videoCodecThreads": 2, "profiles": ["mkv-to-mp4-mpeg4"]},
    {"name": "within-webm", "wasmPthreadPoolSize": 8, "videoCodecThreads": 4, "profiles": ["mkv-to-webm"]}
  ],
  "wasmSimd": true,
  "avioInputBufferBytes": 262144,
  "avioOutputBufferBytes": 262144,
  "outstandingWrites": 1,
  "audioFifoMaximumQueuedSamples": 16384,
  "largeFileMemfs": false,
  "profiles": ["mkv-to-mp4", "mov-to-mp4", "mpeg-ts-to-mp4", "flv-to-mp4", "avi-to-mp4", "mkv-to-m4a", "mov-to-m4a", "mpeg-ts-to-m4a", "flv-to-m4a", "mp4-to-m4a", "mkv-to-wav", "mov-to-wav", "mpeg-ts-to-wav", "flv-to-wav", "avi-to-wav", "mp4-to-wav", "m4a-to-wav", "mp3-to-wav", "flac-to-wav", "aiff-to-wav", "ogg-to-wav", "opus-to-wav", "m4a-to-flac", "mp3-to-flac", "wav-to-flac", "mkv-to-mp4-mpeg4", "mkv-to-webm"],
  "enabledDecoders": ["aac", "flac", "h264", "hevc", "mp3", "opus", "pcm_s16be", "pcm_s16le", "vorbis"],
  "enabledEncoders": ["flac", "h263", "libvpx_vp8", "mpeg4", "pcm_s16le"],
  "enabledDemuxers": ["aiff", "avi", "flac", "flv", "matroska", "mov", "mp3", "mpegts", "ogg", "wav"],
  "enabledMuxers": ["adts", "flac", "latm", "mov", "mp4", "mpegts", "wav", "webm"],
  "enabledParsers": ["aac", "ac3", "flac", "h264", "hevc", "mpeg4video", "mpegaudio", "opus", "vorbis"],
  "enabledBitstreamFilters": ["aac_adtstoasc", "extract_extradata", "h264_mp4toannexb", "hevc_mp4toannexb", "vp9_superframe", "vvc_mp4toannexb"]
}
EOF
