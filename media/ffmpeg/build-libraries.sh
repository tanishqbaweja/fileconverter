#!/usr/bin/env bash
set -euo pipefail

FFMPEG_DIR=/src/ffmpeg
PREFIX=/src/install
export PKG_CONFIG_PATH="${PREFIX}/lib/pkgconfig"

THEORA_CONFIGURE_FLAGS=()
EXTERNAL_CODEC_FLAGS=()
DECODER_CONFIGURE_FLAGS=()
ENCODER_CONFIGURE_FLAGS=()

if [[ "${WITHIN_MP4_COPY_ONLY:-0}" == "1" ]]; then
  ENABLED_DEMUXERS=matroska
  ENABLED_MUXERS=mp4
  ENABLED_PARSERS=aac,h264,hevc
  ENABLED_BSFS=aac_adtstoasc
else
  ENABLED_DEMUXERS=aac,aiff,amr,asf,avi,flac,flv,h264,hevc,ivf,m4v,matroska,mov,mp3,mpegts,mpegvideo,ogg,wav
  if [[ "${WITHIN_ENABLE_AVI_MUXER:-1}" == "1" ]]; then
    ENABLED_MUXERS=tgp,aiff,amr,asf,avi,flac,flv,h264,hevc,ipod,ivf,m4v,matroska,mp3,mp4,mov,mpeg2video,mpegts,adts,ogg,wav,webm
  else
    ENABLED_MUXERS=tgp,aiff,amr,asf,flac,flv,h264,hevc,ipod,m4v,matroska,mp3,mp4,mov,mpeg2video,mpegts,adts,ogg,wav,webm
  fi
  ENABLED_PARSERS=aac,flac,h264,hevc,mpeg4video,mpegaudio,mpegvideo,opus,vorbis
  if [[ "${WITHIN_ENABLE_AV1_PARSER:-1}" == "1" ]]; then
    ENABLED_PARSERS="${ENABLED_PARSERS},av1"
  fi
  ENABLED_BSFS=aac_adtstoasc,extract_extradata,h264_mp4toannexb,hevc_mp4toannexb
  ENABLED_ENCODERS=aac,alac,flac,libmp3lame,libopencore_amrnb,libopus,libvorbis,pcm_s16be,pcm_s16le,mpeg4,libvpx_vp8,libvpx_vp9,wmav2
  if [[ "${WITHIN_ENABLE_THEORA_ENCODER:-0}" == "1" ]]; then
    THEORA_CONFIGURE_FLAGS+=(--enable-libtheora)
    ENABLED_ENCODERS="${ENABLED_ENCODERS},libtheora"
  fi
  EXTERNAL_CODEC_FLAGS=(
    --enable-libvpx
    --enable-libopencore-amrnb
    --enable-libmp3lame
    --enable-libopus
    --enable-libvorbis
  )
  DECODER_CONFIGURE_FLAGS=(--enable-decoder=aac,alac,amrnb,amrwb,flac,h264,hevc,mp3,mpeg2video,mpeg4,opus,pcm_s16be,pcm_s16le,theora,vorbis,wmav1,wmav2)
  ENCODER_CONFIGURE_FLAGS=(--enable-encoder="${ENABLED_ENCODERS}")
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
  "${EXTERNAL_CODEC_FLAGS[@]}" \
  "${THEORA_CONFIGURE_FLAGS[@]}" \
  --enable-version3 \
  --enable-avformat \
  --enable-avcodec \
  --enable-avutil \
  --enable-swresample \
  --enable-swscale \
  --enable-demuxer="${ENABLED_DEMUXERS}" \
  --enable-muxer="${ENABLED_MUXERS}" \
  "${DECODER_CONFIGURE_FLAGS[@]}" \
  "${ENCODER_CONFIGURE_FLAGS[@]}" \
  --enable-parser="${ENABLED_PARSERS}" \
  --enable-bsf="${ENABLED_BSFS}" \
  --extra-cflags="-O3 -fno-math-errno -msimd128 -pthread -I${PREFIX}/include" \
  --extra-ldflags="-O3 -pthread -L${PREFIX}/lib"

emmake make -j"$(nproc)"
emmake make install
