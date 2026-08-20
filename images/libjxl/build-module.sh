#!/usr/bin/env bash
set -euo pipefail

mkdir -p /src/build /out

emcmake cmake -S /src/wrapper -B /src/build/wrapper \
  -DCMAKE_BUILD_TYPE=Release
cmake --build /src/build/wrapper --target within-jxl --parallel "$(nproc)"

cp /src/libjxl/LICENSE /out/LICENSE.libjxl
cp /src/libjxl/PATENTS /out/PATENTS.libjxl
cp /src/libjxl/third_party/brotli/LICENSE /out/LICENSE.brotli
cp /src/libjxl/third_party/highway/LICENSE /out/LICENSE.highway
cp /src/libjxl/third_party/skcms/LICENSE /out/LICENSE.skcms
cp /src/libpng/LICENSE /out/LICENSE.libpng
cp /src/zlib/LICENSE /out/LICENSE.zlib
sed -i 's/[[:space:]]*$//' \
  /out/LICENSE.libjxl /out/PATENTS.libjxl /out/LICENSE.brotli \
  /out/LICENSE.highway /out/LICENSE.skcms /out/LICENSE.libpng /out/LICENSE.zlib

cat > /out/build-manifest.json <<'JSON'
{
  "engine": "within-jxl",
  "libjxlVersion": "0.12.0",
  "libjxlCommit": "a7a9c787341cf703dede03c2009fa460cae5e5df",
  "brotliCommit": "028fb5a23661f123017c060daa546b55cf4bde29",
  "highwayCommit": "457c891775a7397bdb0376bb1031e6e027af1c48",
  "skcmsCommit": "96d9171c94b937a1b5f0293de7309ac16311b722",
  "libpngVersion": "1.6.58",
  "libpngSourceSha256": "28eb403f51f0f7405249132cecfe82ea5c0ef97f1b32c5a65828814ae0d34775",
  "zlibVersion": "1.3.2",
  "zlibSourceSha256": "d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3",
  "emscriptenImage": "emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b",
  "initialWasmMemoryBytes": 117440512,
  "maximumWasmMemoryBytes": 117440512,
  "decoderAllocationLimitBytes": 106954752,
  "inputReadBytes": 262144,
  "inputWindowBytes": 1048576,
  "outputWriteBytes": 65536,
  "maximumInputBytes": 67108864,
  "maximumOutputBytes": 100663296,
  "maximumDimension": 8192,
  "maximumPixels": 8388608,
  "maximumIccBytes": 4194304,
  "maximumStripeRows": 256,
  "maximumStripeBytes": 16777216,
  "maximumAnimationFrameDecodedBytes": 16777216,
  "animationFramePngCompressionLevel": 1,
  "outstandingWrites": 1,
  "threads": 1,
  "maximumFrames": 1000,
  "maximumAggregateDecodedBytes": 68719476736,
  "maximumAggregateExpansionRatio": 1000,
  "profiles": ["jxl-to-png", "jxl-to-zip"]
}
JSON
