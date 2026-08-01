#!/usr/bin/env bash
set -euo pipefail

export CFLAGS="-O3 -flto"
export LDFLAGS="-O3 -flto"

cd /src/zlib
emconfigure ./configure --static
emmake make -j"$(nproc)" libz.a

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
export CPPFLAGS="-I/src/zlib"
export LDFLAGS="-O3 -flto -L/src/zlib"
export LIBS="-lz"
emconfigure ./configure \
  --host=wasm32-unknown-emscripten \
  --disable-shared \
  --enable-static \
  --disable-tools \
  --disable-tests \
  --disable-contrib \
  --disable-docs \
  --disable-cxx \
  --without-jpeg \
  --without-old-jpeg \
  --without-jbig \
  --without-lerc \
  --without-lzma \
  --without-webp \
  --without-zstd \
  --with-zlib
emmake make -C libtiff -j"$(nproc)"
