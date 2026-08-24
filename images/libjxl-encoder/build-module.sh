#!/usr/bin/env bash
set -euo pipefail

export CFLAGS="-O3 -flto"
export CXXFLAGS="-O3 -flto"
export LDFLAGS="-O3 -flto"

mkdir -p /src/build /out
emcmake cmake -S /src/wrapper -B /src/build/wrapper -DCMAKE_BUILD_TYPE=Release
cmake --build /src/build/wrapper --target within-jxl-encoder --parallel "$(nproc)"

cp /src/libjxl/LICENSE /out/LICENSE.libjxl
cp /src/libjxl/PATENTS /out/PATENTS.libjxl
cp /src/libjxl/third_party/brotli/LICENSE /out/LICENSE.brotli
cp /src/libjxl/third_party/highway/LICENSE /out/LICENSE.highway
cp /src/libjxl/third_party/libpng/LICENSE /out/LICENSE.libpng
cp /src/libjxl/third_party/skcms/LICENSE /out/LICENSE.skcms
sed -i 's/[[:space:]]*$//' /out/LICENSE.* /out/PATENTS.*

cat > /out/build-manifest.json <<'JSON'
{
  "engine": "within-jxl-encoder",
  "libjxlVersion": "0.12.0",
  "libjxlCommit": "a7a9c787341cf703dede03c2009fa460cae5e5df",
  "brotliCommit": "028fb5a23661f123017c060daa546b55cf4bde29",
  "highwayCommit": "457c891775a7397bdb0376bb1031e6e027af1c48",
  "libpngCommit": "872555f4ba910252783af1507f9e7fe1653be252",
  "skcmsCommit": "96d9171c94b937a1b5f0293de7309ac16311b722",
  "emscriptenImage": "emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b",
  "initialWasmMemoryBytes": 58720256,
  "maximumWasmMemoryBytes": 58720256,
  "encoderAllocationLimitBytes": 46137344,
  "pixelCallbackLimitBytes": 16777216,
  "outputWriteBytes": 65536,
  "inputReadBytes": 262144,
  "maximumBmpRowBytes": 32768,
  "maximumOutputBytes": 134217728,
  "maximumDimension": 8192,
  "maximumPixels": 8388608,
  "outstandingWrites": 1,
  "threads": 1,
  "encoding": "lossless",
  "effort": 1,
  "animationTicksPerSecond": 1000000,
  "maximumFrames": 1000,
  "maximumAggregateDecodedBytes": 68719476736,
  "maximumAggregateExpansionRatio": 1000,
  "reusedAnimationFrameBuffer": true,
  "profiles": ["png-to-jxl", "jpeg-to-jxl", "webp-to-jxl", "gif-to-jxl", "avif-to-jxl", "bmp-to-jxl"]
}
JSON
