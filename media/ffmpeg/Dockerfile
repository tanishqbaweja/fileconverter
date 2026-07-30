FROM emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b AS build

ARG FFMPEG_VERSION=8.1.2
ARG FFMPEG_SHA256=464beb5e7bf0c311e68b45ae2f04e9cc2af88851abb4082231742a74d97b524c

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

COPY build-libraries.sh /src/build-libraries.sh
RUN chmod +x /src/build-libraries.sh && /src/build-libraries.sh

COPY build-remux.sh /src/build-remux.sh
COPY within_remux.c /src/within_remux.c
RUN chmod +x /src/build-remux.sh && /src/build-remux.sh

FROM scratch AS artifact
COPY --from=build /out/ /
