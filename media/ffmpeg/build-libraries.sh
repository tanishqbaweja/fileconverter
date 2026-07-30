#!/usr/bin/env bash
set -euo pipefail

FFMPEG_DIR=/src/ffmpeg
PREFIX=/src/install

cd "${FFMPEG_DIR}"

emconfigure ./configure \
  --prefix="${PREFIX}" \
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
  --disable-pthreads \
  --disable-runtime-cpudetect \
  --disable-asm \
  --disable-avdevice \
  --disable-avfilter \
  --disable-iconv \
  --disable-zlib \
  --disable-bzlib \
  --disable-lzma \
  --enable-avformat \
  --enable-avcodec \
  --enable-avutil \
  --enable-swresample \
  --enable-swscale \
  --enable-demuxer=matroska \
  --enable-muxer=mp4,mov,mpegts,adts,wav \
  --enable-decoder=aac,h264,hevc \
  --enable-encoder=pcm_s16le,mpeg4 \
  --enable-parser=aac,hevc \
  --enable-bsf=aac_adtstoasc,extract_extradata,hevc_mp4toannexb \
  --extra-cflags="-O3 -fno-math-errno" \
  --extra-ldflags="-O3"

emmake make -j"$(nproc)"
emmake make install
