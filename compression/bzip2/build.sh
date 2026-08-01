#!/usr/bin/env bash
set -euo pipefail

mkdir -p /out

emcc \
  /src/within_bzip2.c \
  /src/bzip2/blocksort.c \
  /src/bzip2/huffman.c \
  /src/bzip2/crctable.c \
  /src/bzip2/randtable.c \
  /src/bzip2/compress.c \
  /src/bzip2/decompress.c \
  /src/bzip2/bzlib.c \
  -I/src/bzip2 \
  -DBZ_NO_STDIO \
  -O3 \
  -flto \
  -s ENVIRONMENT=worker \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=createWithinBzip2Module \
  -s FILESYSTEM=0 \
  -s INITIAL_MEMORY=8388608 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s STACK_SIZE=262144 \
  -s MALLOC=emmalloc \
  -s ASSERTIONS=0 \
  -s NO_EXIT_RUNTIME=1 \
  -s EXPORTED_FUNCTIONS='["_within_bzip2_create","_within_bzip2_process","_within_bzip2_last_consumed","_within_bzip2_last_produced","_within_bzip2_finished","_within_bzip2_destroy","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["HEAPU8"]' \
  -o /out/within-bzip2.mjs

cp /src/bzip2/LICENSE /out/LICENSE.bzip2
sed -i 's/[[:space:]]*$//' /out/LICENSE.bzip2

cat > /out/build-manifest.json <<'JSON'
{
  "engine": "within-bzip2",
  "bzip2Version": "1.0.8",
  "bzip2Source": "https://sourceware.org/pub/bzip2/bzip2-1.0.8.tar.gz",
  "bzip2SourceSha256": "ab5a03176ee106d3f0fa90e381da478ddae405918153cca248e682cd0c4a2269",
  "emscriptenImage": "emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b",
  "license": "bzip2-1.0.8 license",
  "initialWasmMemoryBytes": 8388608,
  "maximumWasmMemoryBytes": 8388608,
  "inputBufferBytes": 262144,
  "outputBufferBytes": 65536,
  "outstandingWrites": 1,
  "compressionBlockSize100k": 1,
  "compressionWorkFactor": 30,
  "decompressionSmallMode": 0,
  "maximumExpandedBytes": 68719476736,
  "maximumExpansionRatio": 100,
  "profiles": ["bzip2-compress", "bzip2-decompress", "tar-to-tar-bz2", "tar-bz2-to-tar"]
}
JSON
