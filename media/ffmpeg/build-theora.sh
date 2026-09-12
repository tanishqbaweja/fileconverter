#!/usr/bin/env bash
set -euo pipefail

PREFIX=/src/install
export PKG_CONFIG_PATH="${PREFIX}/lib/pkgconfig"
cd /src/libtheora

emconfigure ./configure \
  --prefix="${PREFIX}" \
  --disable-shared \
  --enable-static \
  --disable-asm \
  --disable-examples \
  --disable-spec
emmake make -j"$(nproc)"
emmake make install
