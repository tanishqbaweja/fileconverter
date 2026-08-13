#!/usr/bin/env bash
set -euo pipefail

FFMPEG_DIR=/src/ffmpeg
PREFIX=/src/install
export PKG_CONFIG_PATH="${PREFIX}/lib/pkgconfig"

print_configure_failure() {
  local status=$?
  if [[ -f "${FFMPEG_DIR}/ffbuild/config.log" ]]; then
    tail -n 180 "${FFMPEG_DIR}/ffbuild/config.log" >&2
  fi
  exit "${status}"
}
trap print_configure_failure ERR

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
  --pkg-config=/src/wasm-pkg-config.sh \
  --pkg-config-flags=--static \
  --disable-programs \
  --disable-doc \
  --disable-debug \
  --disable-network \
  --disable-devices \
  --enable-pthreads \
  --disable-runtime-cpudetect \
  --disable-asm \
  --disable-avdevice \
  --disable-avfilter \
  --disable-iconv \
  --disable-zlib \
  --disable-bzlib \
  --disable-lzma \
  --enable-libvpx \
  --enable-libopencore-amrnb \
  --enable-libmp3lame \
  --enable-libopus \
  --enable-libvorbis \
  --enable-version3 \
  --enable-avformat \
  --enable-avcodec \
  --enable-avutil \
  --enable-swresample \
  --enable-swscale \
  --enable-demuxer=aac,aiff,amr,asf,avi,flac,flv,h264,m4v,matroska,mov,mp3,mpegts,mpegvideo,ogg,wav \
  --enable-muxer=tgp,aiff,amr,asf,flac,flv,h264,hevc,ipod,m4v,matroska,mp3,mp4,mov,mpeg2video,mpegts,adts,ogg,wav,webm \
  --enable-decoder=aac,alac,amrnb,flac,h264,hevc,mp3,mpeg2video,mpeg4,opus,pcm_s16be,pcm_s16le,theora,vorbis,wmav1,wmav2 \
  --enable-encoder=aac,alac,flac,libmp3lame,libopencore_amrnb,libopus,libvorbis,pcm_s16be,pcm_s16le,mpeg4,libvpx_vp8,libvpx_vp9,wmav2 \
  --enable-parser=aac,flac,h264,hevc,mpeg4video,mpegaudio,mpegvideo,opus,vorbis \
  --enable-bsf=aac_adtstoasc,extract_extradata,h264_mp4toannexb,hevc_mp4toannexb \
  --extra-cflags="-O3 -fno-math-errno -msimd128 -pthread -I${PREFIX}/include" \
  --extra-ldflags="-O3 -pthread -L${PREFIX}/lib"

emmake make -j"$(nproc)"
emmake make install
