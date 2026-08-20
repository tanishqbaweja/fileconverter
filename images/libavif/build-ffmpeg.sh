#!/usr/bin/env bash
set -euo pipefail

cd /src/ffmpeg
emconfigure ./configure \
  --prefix=/src/build/libraries/ffmpeg-install \
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
  --disable-avformat \
  --disable-avcodec \
  --disable-swresample \
  --disable-iconv \
  --disable-zlib \
  --disable-bzlib \
  --disable-lzma \
  --enable-avutil \
  --enable-swscale \
  --extra-cflags='-O3 -fno-math-errno -msimd128 -flto' \
  --extra-ldflags='-O3 -flto'
emmake make -j"$(nproc)" libavutil/libavutil.a libswscale/libswscale.a
