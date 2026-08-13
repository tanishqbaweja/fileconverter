#!/usr/bin/env bash
set -euo pipefail

mkdir -p /out

emcc \
  /src/within_tiff.c \
  /src/libtiff/libtiff/.libs/libtiff.a \
  /src/libpng/.libs/libpng16.a \
  /src/libjpeg-turbo/build/libjpeg.a \
  /src/zlib/libz.a \
  -I/src/libtiff/libtiff \
  -I/src/libpng \
  -I/src/libjpeg-turbo/src \
  -I/src/libjpeg-turbo/build \
  -I/src/zlib \
  -O3 \
  -flto \
  -s ENVIRONMENT=worker \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=createWithinTiffModule \
  -s FILESYSTEM=0 \
  -s ASYNCIFY=1 \
  -s ASYNCIFY_STACK_SIZE=1048576 \
  -s ASYNCIFY_IMPORTS='["within_tiff_input_read","within_png_output_write"]' \
  -s INITIAL_MEMORY=41943040 \
  -s ALLOW_MEMORY_GROWTH=0 \
  -s STACK_SIZE=1048576 \
  -s MALLOC=emmalloc \
  -s ASSERTIONS=0 \
  -s NO_EXIT_RUNTIME=1 \
  -s EXPORTED_FUNCTIONS='["_within_tiff_to_png","_within_tiff_error","_within_tiff_has_more_pages"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","UTF8ToString","HEAPU8"]' \
  -o /out/within-tiff.mjs

cp /src/libtiff/LICENSE.md /out/LICENSE.libtiff
cp /src/libpng/LICENSE /out/LICENSE.libpng
cp /src/zlib/LICENSE /out/LICENSE.zlib
cp /src/libjpeg-turbo/LICENSE.md /out/LICENSE.libjpeg-turbo
sed -i 's/[[:space:]]*$//' /out/LICENSE.libtiff /out/LICENSE.libpng /out/LICENSE.zlib /out/LICENSE.libjpeg-turbo

cat > /out/build-manifest.json <<'JSON'
{
  "engine": "within-tiff",
  "libtiffVersion": "4.7.2",
  "libtiffSource": "https://download.osgeo.org/libtiff/tiff-4.7.2.tar.xz",
  "libtiffSourceSha256": "4996f0c4f93094719b1ca5c6279b20e588773ba8a247533e486416fb662ddb88",
  "libpngVersion": "1.6.58",
  "libpngSource": "https://download.sourceforge.net/libpng/libpng-1.6.58.tar.xz",
  "libpngSourceSha256": "28eb403f51f0f7405249132cecfe82ea5c0ef97f1b32c5a65828814ae0d34775",
  "zlibVersion": "1.3.2",
  "zlibSource": "https://zlib.net/zlib-1.3.2.tar.xz",
  "zlibSourceSha256": "d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3",
  "libjpegTurboVersion": "3.1.4.1",
  "libjpegTurboSource": "https://github.com/libjpeg-turbo/libjpeg-turbo/releases/download/3.1.4.1/libjpeg-turbo-3.1.4.1.tar.gz",
  "libjpegTurboSourceSha256": "ecae8008e2cc9ade2f2c1bb9d5e6d4fb73e7c433866a056bd82980741571a022",
  "emscriptenImage": "emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b",
  "initialWasmMemoryBytes": 41943040,
  "maximumWasmMemoryBytes": 41943040,
  "asyncifyStackBytes": 1048576,
  "inputBufferBytes": 262144,
  "outputBufferBytes": 65536,
  "maximumInputBytes": 67108864,
  "maximumOutputBytes": 67108864,
  "maximumPixels": 16777216,
  "maximumStripBytes": 4194304,
  "maximumDecodedBlockBytes": 4194304,
  "maximumTileStripeBytes": 4194304,
  "maximumTransposedStripeBytes": 16777216,
  "maximumExpansionRatio": 1000,
  "outstandingWrites": 1,
  "readCompressions": ["none", "packbits", "lzw", "deflate", "jpeg"],
  "readOrientations": [1, 2, 3, 4, 5, 6, 7, 8],
  "profiles": ["tiff-to-png"]
}
JSON
