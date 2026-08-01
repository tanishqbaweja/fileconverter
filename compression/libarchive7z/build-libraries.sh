#!/usr/bin/env bash
set -euo pipefail

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

cd /src/libarchive
export CPPFLAGS="-I/src/xz/src/liblzma/api -include /src/within_archive_temp_bridge.h"
export CFLAGS="-O3 -flto"
export LDFLAGS="-O3 -flto -L/src/xz/src/liblzma/.libs"
export LIBS="-llzma"
emconfigure ./configure \
  --host=wasm32-unknown-emscripten \
  --disable-shared \
  --enable-static \
  --disable-bsdtar \
  --disable-bsdcat \
  --disable-bsdcpio \
  --disable-bsdunzip \
  --without-zlib \
  --without-bz2lib \
  --without-libb2 \
  --without-iconv \
  --without-lz4 \
  --without-zstd \
  --with-lzma \
  --without-lzo2 \
  --without-cng \
  --without-mbedtls \
  --without-nettle \
  --without-openssl \
  --without-xml2 \
  --without-expat \
  --disable-xattr \
  --disable-acl
emmake make -j"$(nproc)"
