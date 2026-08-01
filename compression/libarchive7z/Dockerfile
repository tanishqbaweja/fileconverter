FROM emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b AS build

ARG LIBARCHIVE_VERSION=3.8.9
ARG LIBARCHIVE_SHA256=888c934f9d95648ecb9163dc8e23ab80a476ecb81a8f1154704a227b5b676dde
ARG XZ_VERSION=5.8.3
ARG XZ_SHA256=fff1ffcf2b0da84d308a14de513a1aa23d4e9aa3464d17e64b9714bfdd0bbfb6

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN curl --fail --location --retry 3 \
      "https://github.com/libarchive/libarchive/releases/download/v${LIBARCHIVE_VERSION}/libarchive-${LIBARCHIVE_VERSION}.tar.xz" \
      --output libarchive.tar.xz \
    && echo "${LIBARCHIVE_SHA256}  libarchive.tar.xz" | sha256sum --check --strict \
    && tar --extract --file libarchive.tar.xz \
    && mv "libarchive-${LIBARCHIVE_VERSION}" libarchive \
    && rm libarchive.tar.xz \
    && curl --fail --location --retry 3 \
      "https://github.com/tukaani-project/xz/releases/download/v${XZ_VERSION}/xz-${XZ_VERSION}.tar.xz" \
      --output xz.tar.xz \
    && echo "${XZ_SHA256}  xz.tar.xz" | sha256sum --check --strict \
    && tar --extract --file xz.tar.xz \
    && mv "xz-${XZ_VERSION}" xz \
    && rm xz.tar.xz

COPY build-libraries.sh /src/build-libraries.sh
COPY libarchive-7zip-opfs.patch /src/libarchive-7zip-opfs.patch
COPY within_archive_temp_bridge.h /src/within_archive_temp_bridge.h
RUN cd /src/libarchive \
    && patch -p1 < /src/libarchive-7zip-opfs.patch
RUN chmod +x /src/build-libraries.sh && /src/build-libraries.sh

COPY within_archive7z.c /src/within_archive7z.c
COPY build-module.sh /src/build-module.sh
RUN chmod +x /src/build-module.sh && /src/build-module.sh

FROM scratch AS artifact
COPY --from=build /out/ /
