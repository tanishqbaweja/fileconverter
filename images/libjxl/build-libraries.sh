#!/usr/bin/env bash
set -euo pipefail

export CFLAGS="-O3 -flto"
export CXXFLAGS="-O3 -flto"
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

emcmake cmake -S /src/library-build -B /src/build/libraries \
  -DCMAKE_BUILD_TYPE=Release
cmake --build /src/build/libraries --target jxl_dec --parallel "$(nproc)"
