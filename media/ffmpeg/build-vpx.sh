#!/usr/bin/env bash
set -euo pipefail

LIBVPX_DIR=/src/libvpx
PREFIX=/src/install

cd "${LIBVPX_DIR}"

LDFLAGS="-pthread" STRIP=emstrip emconfigure ./configure \
  --prefix="${PREFIX}" \
  --target=generic-gnu \
  --disable-examples \
  --disable-tools \
  --disable-docs \
  --disable-unit-tests \
  --disable-webm-io \
  --disable-libyuv \
  --disable-runtime-cpu-detect \
  --enable-multithread \
  --enable-realtime-only \
  --disable-vp8-decoder \
  --disable-vp9-decoder \
  --enable-vp8-encoder \
  --enable-vp9-encoder \
  --enable-static \
  --disable-shared \
  --extra-cflags="-O3 -fno-math-errno -msimd128 -pthread"

emmake make -j"$(nproc)"
emmake make install
