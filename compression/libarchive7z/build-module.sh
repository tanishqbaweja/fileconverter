#!/usr/bin/env bash
set -euo pipefail

mkdir -p /out

emcc \
  /src/within_archive7z.c \
  /src/libarchive/.libs/libarchive.a \
  /src/xz/src/liblzma/.libs/liblzma.a \
  -I/src/libarchive/libarchive \
  -I/src/xz/src/liblzma/api \
  -O3 \
  -flto \
  -s ENVIRONMENT=worker \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=createWithinArchive7zModule \
  -s FILESYSTEM=0 \
  -s ASYNCIFY=1 \
  -s ASYNCIFY_STACK_SIZE=1048576 \
  -s ASYNCIFY_IMPORTS='["within_archive_input_read","within_archive_output_write"]' \
  -s INITIAL_MEMORY=67108864 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s STACK_SIZE=1048576 \
  -s MALLOC=emmalloc \
  -s ASSERTIONS=0 \
  -s NO_EXIT_RUNTIME=1 \
  -s EXPORTED_FUNCTIONS='["_within_archive_7z_to_tar","_within_archive_error"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","UTF8ToString","HEAPU8"]' \
  -o /out/within-archive7z.mjs

cp /src/libarchive/COPYING /out/LICENSE.libarchive
cp /src/xz/COPYING.0BSD /out/LICENSE.xz
sed -i 's/[[:space:]]*$//' /out/LICENSE.libarchive /out/LICENSE.xz

cat > /out/build-manifest.json <<'JSON'
{
  "engine": "within-archive7z",
  "libarchiveVersion": "3.8.9",
  "libarchiveSource": "https://github.com/libarchive/libarchive/releases/download/v3.8.9/libarchive-3.8.9.tar.xz",
  "libarchiveSourceSha256": "888c934f9d95648ecb9163dc8e23ab80a476ecb81a8f1154704a227b5b676dde",
  "xzVersion": "5.8.3",
  "xzSourceSha256": "fff1ffcf2b0da84d308a14de513a1aa23d4e9aa3464d17e64b9714bfdd0bbfb6",
  "emscriptenImage": "emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b",
  "initialWasmMemoryBytes": 67108864,
  "maximumWasmMemoryBytes": 67108864,
  "asyncifyStackBytes": 1048576,
  "inputBufferBytes": 262144,
  "outputBufferBytes": 65536,
  "outstandingWrites": 1,
  "maximumEntries": 10000,
  "nameTableSlots": 32768,
  "maximumExpandedBytes": 68719476736,
  "maximumExpansionRatio": 100,
  "readCodecs": ["copy", "lzma1", "lzma2", "ppmd"],
  "profiles": ["sevenzip-to-tar"]
}
JSON
