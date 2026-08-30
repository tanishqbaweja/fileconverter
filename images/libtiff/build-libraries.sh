#!/usr/bin/env bash
set -euo pipefail

export CFLAGS="-O3 -flto"
export LDFLAGS="-O3 -flto"
# libjpeg-turbo embeds a YYYYMMDD build string. Pin the published build date so
# clean builds remain byte-identical instead of varying with wall-clock time.
export SOURCE_DATE_EPOCH="${SOURCE_DATE_EPOCH:-1786579200}"

cd /src/zlib
emconfigure ./configure --static
emmake make -j"$(nproc)" libz.a

cd /src/libjpeg-turbo
emcmake cmake -S . -B build \
  -DCMAKE_BUILD_TYPE=Release \
  -DENABLE_SHARED=OFF \
  -DENABLE_STATIC=ON \
  -DWITH_SIMD=OFF \
  -DWITH_TURBOJPEG=OFF \
  -DWITH_TOOLS=OFF \
  -DWITH_TESTS=OFF
cmake --build build --target jpeg-static --parallel "$(nproc)"

cd /src/libpng
export CPPFLAGS="-I/src/zlib"
export LDFLAGS="-O3 -flto -L/src/zlib"
export LIBS="-lz"
emconfigure ./configure \
  --host=wasm32-unknown-emscripten \
  --disable-shared \
  --enable-static \
  --disable-tools \
  --disable-tests
emmake make -j"$(nproc)"

cd /src/libtiff
export CPPFLAGS="-I/src/zlib -I/src/libjpeg-turbo/src -I/src/libjpeg-turbo/build"
export LDFLAGS="-O3 -flto -L/src/zlib -L/src/libjpeg-turbo/build"
export LIBS="-ljpeg -lz"
emconfigure ./configure \
  --host=wasm32-unknown-emscripten \
  --disable-shared \
  --enable-static \
  --disable-tools \
  --disable-tests \
  --disable-contrib \
  --disable-docs \
  --disable-cxx \
  --enable-jpeg \
  --with-jpeg-include-dir=/src/libjpeg-turbo/src \
  --with-jpeg-lib-dir=/src/libjpeg-turbo/build \
  --disable-old-jpeg \
  --disable-jbig \
  --disable-lerc \
  --disable-lzma \
  --disable-webp \
  --disable-zstd \
  --enable-zlib
emmake make -C libtiff -j"$(nproc)"
