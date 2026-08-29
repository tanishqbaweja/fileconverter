#!/usr/bin/env bash
set -euo pipefail

PREFIX=/src/install
export PKG_CONFIG_PATH="${PREFIX}/lib/pkgconfig"
cd /src/libvorbis

emconfigure ./configure \
  --prefix="${PREFIX}" \
  --disable-shared \
  --enable-static \
  --disable-docs \
  --disable-examples \
  --disable-oggtest
emmake make -j"$(nproc)"
emmake make install
