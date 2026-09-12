#!/usr/bin/env bash
set -euo pipefail

FFMPEG_DIR=/src/ffmpeg
PREFIX=/src/install
export PKG_CONFIG_PATH="${PREFIX}/lib/pkgconfig"

if [[ "${WITHIN_ENABLE_AVI_MUXER:-1}" == "1" ]]; then
  ENABLED_MUXERS=tgp,aiff,amr,asf,avi,flac,flv,h264,hevc,ipod,ivf,m4v,matroska,mp3,mp4,mov,mpeg2video,mpegts,adts,ogg,wav,webm
else
  ENABLED_MUXERS=tgp,aiff,amr,asf,flac,flv,h264,hevc,ipod,m4v,matroska,mp3,mp4,mov,mpeg2video,mpegts,adts,ogg,wav,webm
fi

ENABLED_PARSERS=aac,flac,h264,hevc,mpeg4video,mpegaudio,mpegvideo,opus,vorbis
if [[ "${WITHIN_ENABLE_AV1_PARSER:-1}" == "1" ]]; then
  ENABLED_PARSERS="${ENABLED_PARSERS},av1"
fi

THEORA_CONFIGURE_FLAGS=()
ENABLED_ENCODERS=aac,alac,flac,libmp3lame,libopencore_amrnb,libopus,libvorbis,pcm_s16be,pcm_s16le,mpeg4,libvpx_vp8,libvpx_vp9,wmav2
if [[ "${WITHIN_ENABLE_THEORA_ENCODER:-0}" == "1" ]]; then
  THEORA_CONFIGURE_FLAGS+=(--enable-libtheora)
  ENABLED_ENCODERS="${ENABLED_ENCODERS},libtheora"
fi

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
  "${THEORA_CONFIGURE_FLAGS[@]}" \
  --enable-version3 \
  --enable-avformat \
  --enable-avcodec \
  --enable-avutil \
  --enable-swresample \
  --enable-swscale \
  --enable-demuxer=aac,aiff,amr,asf,avi,flac,flv,h264,hevc,ivf,m4v,matroska,mov,mp3,mpegts,mpegvideo,ogg,wav \
  --enable-muxer="${ENABLED_MUXERS}" \
  --enable-decoder=aac,alac,amrnb,amrwb,flac,h264,hevc,mp3,mpeg2video,mpeg4,opus,pcm_s16be,pcm_s16le,theora,vorbis,wmav1,wmav2 \
  --enable-encoder="${ENABLED_ENCODERS}" \
  --enable-parser="${ENABLED_PARSERS}" \
  --enable-bsf=aac_adtstoasc,extract_extradata,h264_mp4toannexb,hevc_mp4toannexb \
  --extra-cflags="-O3 -fno-math-errno -msimd128 -pthread -I${PREFIX}/include" \
  --extra-ldflags="-O3 -pthread -L${PREFIX}/lib"

emmake make -j"$(nproc)"
emmake make install
