#!/usr/bin/env bash
set -euo pipefail

export PKG_CONFIG_PATH=/src/build/aom-install/lib/pkgconfig
export EM_PKG_CONFIG_PATH="${PKG_CONFIG_PATH}"

cd /src/ffmpeg
emconfigure ./configure \
  --prefix=/src/build/ffmpeg-install \
  --cc=emcc \
  --cxx=em++ \
  --ar=emar \
  --ranlib=emranlib \
  --nm=emnm \
  --arch=wasm \
  --target-os=none \
  --disable-everything \
  --disable-autodetect \
  --disable-programs \
  --disable-doc \
  --disable-debug \
  --disable-network \
  --disable-devices \
  --disable-runtime-cpudetect \
  --disable-asm \
  --disable-avdevice \
  --disable-avfilter \
  --disable-swresample \
  --disable-iconv \
  --disable-zlib \
  --disable-bzlib \
  --disable-lzma \
  --disable-pthreads \
  --enable-avformat \
  --enable-avcodec \
  --enable-avutil \
  --enable-swscale \
  --enable-libaom \
  --enable-encoder=libaom_av1 \
  --enable-muxer=avif \
  --enable-bsf=extract_extradata \
  --extra-cflags='-O3 -fno-math-errno -msimd128 -flto -I/src/build/aom-install/include' \
  --extra-ldflags='-O3 -flto -L/src/build/aom-install/lib' \
  --extra-libs='-laom -lm'
emmake make -j"$(nproc)" install
test -f /src/build/ffmpeg-install/lib/libavformat.a
test -f /src/build/ffmpeg-install/lib/libavcodec.a
test -f /src/build/ffmpeg-install/lib/libswscale.a
test -f /src/build/ffmpeg-install/lib/libavutil.a
