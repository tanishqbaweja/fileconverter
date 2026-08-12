#!/usr/bin/env bash
set -euo pipefail

PREFIX=/src/install

cd /src/lame

emconfigure ./configure \
  --prefix="${PREFIX}" \
  --disable-shared \
  --enable-static \
  --disable-frontend \
  --disable-decoder \
  --disable-analyzer-hooks

emmake make -j"$(nproc)"
emmake make install
