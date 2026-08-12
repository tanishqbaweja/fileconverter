FROM emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b AS build

ARG FFMPEG_VERSION=8.1.2
ARG FFMPEG_SHA256=464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c
ARG LIBVPX_VERSION=1.16.0
ARG LIBVPX_SHA256=7a479a3c66b9f5d5542a4c6a1b7d3768a983b1e5c14c60a9396edc9b649e015c
ARG OPENCORE_AMR_VERSION=0.1.6
ARG OPENCORE_AMR_SHA256=483eb4061088e2b34b358e47540b5d495a96cd468e361050fae615b1809dc4a1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
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

COPY build-vpx.sh /src/build-vpx.sh
RUN chmod +x /src/build-vpx.sh && /src/build-vpx.sh

COPY build-opencore-amr.sh /src/build-opencore-amr.sh
RUN chmod +x /src/build-opencore-amr.sh && /src/build-opencore-amr.sh

COPY patches/amr-bounded-packets.patch /src/amr-bounded-packets.patch
RUN patch --directory=/src/ffmpeg --strip=1 < /src/amr-bounded-packets.patch

COPY build-libraries.sh /src/build-libraries.sh
RUN chmod +x /src/build-libraries.sh && /src/build-libraries.sh

COPY build-remux.sh /src/build-remux.sh
COPY within_remux.c /src/within_remux.c
ARG WITHIN_BUILD_CORE_FILTER=all
RUN chmod +x /src/build-remux.sh \
    && WITHIN_BUILD_CORE_FILTER="${WITHIN_BUILD_CORE_FILTER}" /src/build-remux.sh

FROM scratch AS artifact
COPY --from=build /out/ /
