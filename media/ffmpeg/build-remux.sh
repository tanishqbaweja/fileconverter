#!/usr/bin/env bash
set -euo pipefail

PREFIX=/src/install
OUTPUT=/out

mkdir -p "${OUTPUT}"

emcc /src/within_remux.c \
  -I"${PREFIX}/include" \
  "${PREFIX}/lib/libavformat.a" \
  "${PREFIX}/lib/libavcodec.a" \
  "${PREFIX}/lib/libswresample.a" \
  "${PREFIX}/lib/libswscale.a" \
  "${PREFIX}/lib/libavutil.a" \
  -O3 \
  -flto \
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
  -o "${OUTPUT}/within-remux.mjs"

cat > "${OUTPUT}/build-manifest.json" <<EOF
{
  "engine": "within-remux",
  "ffmpegVersion": "8.1.2",
  "ffmpegSourceSha256": "464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c",
  "emscriptenImage": "emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b",
  "initialWasmMemoryBytes": 33554432,
  "maximumWasmMemoryBytes": 100663296,
  "avioInputBufferBytes": 262144,
  "avioOutputBufferBytes": 262144,
  "outstandingWrites": 1,
  "largeFileMemfs": false,
  "profiles": ["mkv-to-mp4", "mkv-to-m4a", "mkv-to-wav", "mkv-to-mp4-mpeg4"],
  "enabledDecoders": ["aac", "h264", "hevc"],
  "enabledEncoders": ["pcm_s16le", "mpeg4"]
}
EOF
