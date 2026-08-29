#!/usr/bin/env bash
set -euo pipefail

PREFIX=/src/install
cd /src/libogg

emconfigure ./configure \
  --prefix="${PREFIX}" \
  --host=wasm32-unknown-emscripten \
  --disable-shared \
  --enable-static
emmake make -j"$(nproc)"
emmake make install
