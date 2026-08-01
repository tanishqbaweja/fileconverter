#!/usr/bin/env bash
set -euo pipefail

mkdir -p /out
cd /src/xz

export CFLAGS="-O3 -flto"
export LDFLAGS="-O3 -flto"
emconfigure ./configure \
  --host=wasm32-unknown-emscripten \
  --disable-shared \
  --enable-static \
  --disable-doc \
  --disable-scripts \
  --disable-xz \
  --disable-xzdec \
  --disable-lzmadec \
  --disable-lzmainfo \
  --disable-nls \
  --disable-threads
emmake make -C src/liblzma -j"$(nproc)"

emcc \
  /src/within_xz.c \
  /src/xz/src/liblzma/.libs/liblzma.a \
  -I/src/xz/src/liblzma/api \
  -O3 \
  -flto \
  -s ENVIRONMENT=worker \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=createWithinXzModule \
  -s FILESYSTEM=0 \
  -s INITIAL_MEMORY=50331648 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s STACK_SIZE=262144 \
  -s MALLOC=emmalloc \
  -s ASSERTIONS=0 \
  -s NO_EXIT_RUNTIME=1 \
  -s EXPORTED_FUNCTIONS='["_within_xz_create","_within_xz_process","_within_xz_last_consumed","_within_xz_last_produced","_within_xz_finished","_within_xz_memusage","_within_xz_destroy","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAPU8"]' \
  -o /out/within-xz.mjs

cp /src/xz/COPYING.0BSD /out/LICENSE.xz
sed -i 's/[[:space:]]*$//' /out/LICENSE.xz

cat > /out/build-manifest.json <<'JSON'
{
  "engine": "within-xz",
  "xzVersion": "5.8.3",
  "xzSource": "https://github.com/tukaani-project/xz/releases/download/v5.8.3/xz-5.8.3.tar.xz",
  "xzSourceSha256": "fff1ffcf2b0da84d308a14de513a1aa23d4e9aa3464d17e64b9714bfdd0bbfb6",
  "emscriptenImage": "emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b",
  "license": "0BSD for liblzma core",
  "initialWasmMemoryBytes": 50331648,
  "maximumWasmMemoryBytes": 50331648,
  "decoderMemoryLimitBytes": 33554432,
  "inputBufferBytes": 262144,
  "outputBufferBytes": 65536,
  "outstandingWrites": 1,
  "compressionPreset": 0,
  "integrityCheck": "CRC64",
  "maximumExpandedBytes": 68719476736,
  "maximumExpansionRatio": 100,
  "profiles": ["xz-compress", "xz-decompress", "tar-to-tar-xz", "tar-xz-to-tar", "tar-xz-to-zip", "zip-to-tar-xz"]
}
JSON
