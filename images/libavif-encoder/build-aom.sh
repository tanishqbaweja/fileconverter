#!/usr/bin/env bash
set -euo pipefail

toolchain_options=()
if [[ -n "${WITHIN_EMSCRIPTEN_TOOLCHAIN_FILE:-}" ]]; then
  toolchain_options+=("-DCMAKE_TOOLCHAIN_FILE=${WITHIN_EMSCRIPTEN_TOOLCHAIN_FILE}")
fi

emcmake cmake -S /src/libavif/ext/aom -B /src/build/aom \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX=/src/build/aom-install \
  -DBUILD_SHARED_LIBS=OFF \
  -DENABLE_DOCS=OFF \
  -DENABLE_EXAMPLES=OFF \
  -DENABLE_TESTS=OFF \
  -DENABLE_TOOLS=OFF \
  -DCONFIG_AV1_DECODER=0 \
  -DCONFIG_AV1_ENCODER=1 \
  -DCONFIG_REALTIME_ONLY=1 \
  -DCONFIG_MULTITHREAD=0 \
  -DCONFIG_RUNTIME_CPU_DETECT=0 \
  -DCONFIG_WEBM_IO=0 \
  -DAOM_TARGET_CPU=generic \
  -DCMAKE_C_FLAGS_RELEASE='-O3 -DNDEBUG -flto' \
  -DCMAKE_CXX_FLAGS_RELEASE='-O3 -DNDEBUG -flto' \
  "${toolchain_options[@]}"
cmake --build /src/build/aom --target install --parallel "$(nproc)"
test -f /src/build/aom-install/lib/libaom.a
test -f /src/build/aom-install/lib/pkgconfig/aom.pc
