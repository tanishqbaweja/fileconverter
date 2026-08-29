FROM emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b AS build

ARG FFMPEG_VERSION=8.1.2
ARG FFMPEG_SHA256=464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c
ARG LIBVPX_VERSION=1.16.0
ARG LIBVPX_SHA256=7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c
ARG OPENCORE_AMR_VERSION=0.1.6
ARG OPENCORE_AMR_SHA256=483eb4061088e2b34b358e47540b5d495a96cd468e361050fae615b1809dc4a1
ARG LAME_VERSION=4.0
ARG LAME_SHA256=3df5124d5ad3a98312ffd7ba6a9b36230e4f8a3e66d3ce0f425e336c32d216eb

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl pkg-config xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN curl --fail --location --retry 3 \
      "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" \
      --output ffmpeg.tar.xz \
    && echo "${FFMPEG_SHA256}  ffmpeg.tar.xz" | sha256sum --check --strict \
    && tar --extract --file ffmpeg.tar.xz \
    && mv "ffmpeg-${FFMPEG_VERSION}" ffmpeg \
    && rm ffmpeg.tar.xz

RUN curl --fail --location --retry 3 \
      "https://github.com/webmproject/libvpx/archive/refs/tags/v${LIBVPX_VERSION}.tar.gz" \
      --output libvpx.tar.gz \
    && echo "${LIBVPX_SHA256}  libvpx.tar.gz" | sha256sum --check --strict \
    && tar --extract --file libvpx.tar.gz \
    && mv "libvpx-${LIBVPX_VERSION}" libvpx \
    && rm libvpx.tar.gz

RUN curl --fail --location --retry 3 \
      "https://downloads.sourceforge.net/project/opencore-amr/opencore-amr/opencore-amr-${OPENCORE_AMR_VERSION}.tar.gz" \
      --output opencore-amr.tar.gz \
    && echo "${OPENCORE_AMR_SHA256}  opencore-amr.tar.gz" | sha256sum --check --strict \
    && tar --extract --file opencore-amr.tar.gz \
    && mv "opencore-amr-${OPENCORE_AMR_VERSION}" opencore-amr \
    && rm opencore-amr.tar.gz

RUN curl --fail --location --retry 3 \
      "https://downloads.sourceforge.net/project/lame/lame/${LAME_VERSION}/lame-${LAME_VERSION}.tar.gz" \
      --output lame.tar.gz \
    && echo "${LAME_SHA256}  lame.tar.gz" | sha256sum --check --strict \
    && tar --extract --file lame.tar.gz \
    && mv "lame-${LAME_VERSION}" lame \
    && rm lame.tar.gz

ARG OPUS_VERSION=1.6.1
ARG OPUS_SHA256=6ffcb593207be92584df15b32466ed64bbec99109f007c82205f0194572411a1
RUN curl --fail --location --retry 3 \
      "https://ftp.osuosl.org/pub/xiph/releases/opus/opus-${OPUS_VERSION}.tar.gz" \
      --output opus.tar.gz \
    && echo "${OPUS_SHA256}  opus.tar.gz" | sha256sum --check --strict \
    && tar --extract --file opus.tar.gz \
    && mv "opus-${OPUS_VERSION}" opus \
    && rm opus.tar.gz

COPY build-vpx.sh /src/build-vpx.sh
RUN chmod +x /src/build-vpx.sh && /src/build-vpx.sh

COPY build-opencore-amr.sh /src/build-opencore-amr.sh
RUN chmod +x /src/build-opencore-amr.sh && /src/build-opencore-amr.sh

COPY build-lame.sh /src/build-lame.sh
RUN chmod +x /src/build-lame.sh && /src/build-lame.sh

COPY build-opus.sh /src/build-opus.sh
RUN chmod +x /src/build-opus.sh && /src/build-opus.sh

ARG LIBOGG_VERSION=1.3.6
ARG LIBOGG_SHA256=5c8253428e181840cd20d41f3ca16557a9cc04bad4a3d04cce84808677fa1061
RUN curl --fail --location --retry 3 \
      "https://downloads.xiph.org/releases/ogg/libogg-${LIBOGG_VERSION}.tar.xz" \
      --output libogg.tar.xz \
    && echo "${LIBOGG_SHA256}  libogg.tar.xz" | sha256sum --check --strict \
    && tar --extract --file libogg.tar.xz \
    && mv "libogg-${LIBOGG_VERSION}" libogg \
    && rm libogg.tar.xz

ARG LIBVORBIS_VERSION=1.3.7
ARG LIBVORBIS_SHA256=b33cc4934322bcbf6efcbacf49e3ca01aadbea4114ec9589d1b1e9d20f72954b
RUN curl --fail --location --retry 3 \
      "https://downloads.xiph.org/releases/vorbis/libvorbis-${LIBVORBIS_VERSION}.tar.xz" \
      --output libvorbis.tar.xz \
    && echo "${LIBVORBIS_SHA256}  libvorbis.tar.xz" | sha256sum --check --strict \
    && tar --extract --file libvorbis.tar.xz \
    && mv "libvorbis-${LIBVORBIS_VERSION}" libvorbis \
    && rm libvorbis.tar.xz

COPY build-ogg.sh /src/build-ogg.sh
RUN chmod +x /src/build-ogg.sh && /src/build-ogg.sh

COPY build-vorbis.sh /src/build-vorbis.sh
RUN chmod +x /src/build-vorbis.sh && /src/build-vorbis.sh

COPY patches/amr-bounded-packets.patch /src/amr-bounded-packets.patch
RUN patch --directory=/src/ffmpeg --strip=1 < /src/amr-bounded-packets.patch

COPY build-libraries.sh /src/build-libraries.sh
COPY wasm-pkg-config.sh /src/wasm-pkg-config.sh
RUN chmod +x /src/build-libraries.sh /src/wasm-pkg-config.sh \
    && /src/build-libraries.sh

COPY build-remux.sh /src/build-remux.sh
COPY within_remux.c /src/within_remux.c
COPY patches/specialist-source-79e4db.patch /src/specialist-source-79e4db.patch
ARG WITHIN_BUILD_CORE_FILTER=all
RUN chmod +x /src/build-remux.sh \
    && if [ "${WITHIN_BUILD_CORE_FILTER}" = all ] || [ "${WITHIN_BUILD_CORE_FILTER}" = within-remux ]; then \
         WITHIN_BUILD_CORE_FILTER=within-remux /src/build-remux.sh; \
       fi \
    && if [ "${WITHIN_BUILD_CORE_FILTER}" != within-remux ]; then \
         patch --reverse --directory=/src --strip=1 < /src/specialist-source-79e4db.patch; \
         if [ "${WITHIN_BUILD_CORE_FILTER}" = all ]; then \
           for specialist_core in within-direct within-mpeg4 within-webm within-vp9; do \
             WITHIN_BUILD_CORE_FILTER="${specialist_core}" /src/build-remux.sh; \
           done; \
         else \
           WITHIN_BUILD_CORE_FILTER="${WITHIN_BUILD_CORE_FILTER}" /src/build-remux.sh; \
         fi; \
       fi

FROM scratch AS artifact
COPY --from=build /out/ /
