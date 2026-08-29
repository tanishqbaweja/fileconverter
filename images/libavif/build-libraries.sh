#!/usr/bin/env bash
set -euo pipefail

mkdir -p /src/build/libraries

emcmake cmake -S /src/libavif -B /src/build/libraries/libavif \
  -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF \
  -DAVIF_CODEC_AOM=LOCAL \
  -DAVIF_CODEC_AOM_DECODE=ON \
  -DAVIF_CODEC_AOM_ENCODE=OFF \
  -DAVIF_LIBYUV=OFF \
  -DAVIF_LIBSHARPYUV=OFF \
  -DAVIF_ZLIBPNG=OFF \
  -DAVIF_JPEG=OFF \
  -DAVIF_BUILD_APPS=OFF \
  -DAVIF_BUILD_EXAMPLES=OFF \
  -DAVIF_BUILD_TESTS=OFF \
  -DAOM_TARGET_CPU=generic \
  -DCMAKE_C_FLAGS_RELEASE='-O3 -DNDEBUG -flto' \
  -DCMAKE_CXX_FLAGS_RELEASE='-O3 -DNDEBUG -flto'
cmake --build /src/build/libraries/libavif --target avif_static --parallel "$(nproc)"

cd /src/zlib
emconfigure ./configure --static
emmake make -j"$(nproc)" CFLAGS='-O3 -flto'

cd /src/libpng
emconfigure ./configure \
  --host=wasm32-unknown-emscripten \
  --disable-shared \
  --enable-static \
  --disable-tools \
  --disable-tests \
  CPPFLAGS='-I/src/zlib' \
  LDFLAGS='-L/src/zlib' \
  CFLAGS='-O3 -flto'
emmake make -j"$(nproc)"
