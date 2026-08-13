#!/usr/bin/env bash
set -euo pipefail

PREFIX=/src/install
cd /src/libogg

emconfigure ./configure --prefix="${PREFIX}" --disable-shared --enable-static
emmake make -j"$(nproc)"
emmake make install
