#!/usr/bin/env bash
set -euo pipefail

PREFIX=/src/install

cd /src/opus

emconfigure ./configure \
  --prefix="${PREFIX}" \
  --host=wasm32-unknown-emscripten \
  --disable-shared \
  --enable-static \
  --disable-doc \
  --disable-extra-programs \
  --disable-rtcd

emmake make -j"$(nproc)"
emmake make install
