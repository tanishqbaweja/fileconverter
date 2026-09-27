#!/usr/bin/env bash
set -euo pipefail

mkdir -p /src/build /out
emcmake cmake -S /src/wrapper -B /src/build/wrapper \
  -DCMAKE_BUILD_TYPE=Release
cmake --build /src/build/wrapper --target within-jxl-inspector --parallel "$(nproc)"

cp /src/libjxl/LICENSE /out/LICENSE.libjxl
cp /src/libjxl/PATENTS /out/PATENTS.libjxl
cp /src/libjxl/third_party/brotli/LICENSE /out/LICENSE.brotli
cp /src/libjxl/third_party/highway/LICENSE /out/LICENSE.highway
cp /src/libjxl/third_party/skcms/LICENSE /out/LICENSE.skcms
sed -i 's/[[:space:]]*$//' \
  /out/LICENSE.libjxl /out/PATENTS.libjxl /out/LICENSE.brotli \
  /out/LICENSE.highway /out/LICENSE.skcms

cat > /out/build-manifest.json <<'JSON'
{
  "engine": "within-jxl-inspector",
  "libjxlVersion": "0.12.0",
  "libjxlCommit": "a7a9c787341cf703dede03c2009fa460cae5e5df",
  "brotliCommit": "028fb5a23661f123017c060daa546b55cf4bde29",
  "highwayCommit": "457c891775a7397bdb0376bb1031e6e027af1c48",
  "skcmsCommit": "96d9171c94b937a1b5f0293de7309ac16311b722",
  "emscriptenVersion": "6.0.4",
  "emsdkCommit": "224ec5f9f2f72f09f9ce0e26d66bae7dbd8b692f",
  "initialWasmMemoryBytes": 16777216,
  "maximumWasmMemoryBytes": 16777216,
  "decoderAllocationLimitBytes": 8388608,
  "singleAllocationLimitBytes": 4194304,
  "inputReadBytes": 65536,
  "inputWindowBytes": 131072,
  "maximumInspectionBytes": 1048576,
  "maximumInputBytes": 67108864,
  "pixelDecode": false,
  "threads": 1,
  "profiles": ["jxl-source-inspection"]
}
JSON
