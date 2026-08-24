FROM emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b AS build

ARG LIBAVIF_VERSION=1.4.1
ARG LIBAVIF_COMMIT=6543b22b5bc706c53f038a16fe515f921556d9b3
ARG LIBAVIF_SHA256=d4aea31a4becb3273ba7968221be2e48148ba05eb8a68d14e671963e17785648
ARG LIBAOM_VERSION=3.13.2
ARG LIBAOM_COMMIT=ad44980d7f3c7a2605c25d51ea96946949000841
ARG FFMPEG_VERSION=8.1.2
ARG FFMPEG_SHA256=464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git patch pkg-config xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN curl --fail --location --retry 3 \
      "https://github.com/AOMediaCodec/libavif/archive/refs/tags/v${LIBAVIF_VERSION}.tar.gz" \
      --output libavif.tar.gz \
    && echo "${LIBAVIF_SHA256}  libavif.tar.gz" | sha256sum --check --strict \
    && tar --extract --file libavif.tar.gz \
    && mv "libavif-${LIBAVIF_VERSION}" libavif \
    && test "$(git ls-remote https://github.com/AOMediaCodec/libavif.git refs/tags/v${LIBAVIF_VERSION}^{} | cut -f1)" = "${LIBAVIF_COMMIT}" \
    && rm libavif.tar.gz \
    && git clone --filter=blob:none --no-checkout https://aomedia.googlesource.com/aom.git /src/libavif/ext/aom \
    && cd /src/libavif/ext/aom \
    && git checkout "${LIBAOM_COMMIT}" \
    && test "$(git rev-parse HEAD)" = "${LIBAOM_COMMIT}" \
    && curl --fail --location --retry 3 \
      "https://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.xz" \
      --output /src/ffmpeg.tar.xz \
    && echo "${FFMPEG_SHA256}  /src/ffmpeg.tar.xz" | sha256sum --check --strict \
    && tar --extract --file /src/ffmpeg.tar.xz --directory /src \
    && mv "/src/ffmpeg-${FFMPEG_VERSION}" /src/ffmpeg \
    && rm /src/ffmpeg.tar.xz

COPY ffmpeg-avif-streaming.patch /src/ffmpeg-avif-streaming.patch
RUN patch --directory=/src/ffmpeg --strip=1 --input=/src/ffmpeg-avif-streaming.patch

COPY build-aom.sh /src/build-aom.sh
COPY build-ffmpeg.sh /src/build-ffmpeg.sh
RUN --mount=type=cache,id=within-avif-encoder-deps,target=/src/build,sharing=locked \
    chmod +x /src/build-aom.sh /src/build-ffmpeg.sh \
    && /src/build-aom.sh \
    && /src/build-ffmpeg.sh

COPY CMakeLists.txt /src/wrapper/CMakeLists.txt
COPY within_avif_encode.c /src/wrapper/within_avif_encode.c
COPY build-module.sh /src/build-module.sh
RUN --mount=type=cache,id=within-avif-encoder-deps,target=/src/build,sharing=locked \
    chmod +x /src/build-module.sh && /src/build-module.sh

FROM scratch AS artifact
COPY --from=build /out/ /
