FROM emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b AS build

ARG LIBTIFF_VERSION=4.7.2
ARG LIBTIFF_SHA256=4996f0c4f93094719b1ca5c6279b20e588773ba8a247533e486416fb662ddb88
ARG LIBPNG_VERSION=1.6.58
ARG LIBPNG_SHA256=28eb403f51f0f7405249132cecfe82ea5c0ef97f1b32c5a65828814ae0d34775
ARG ZLIB_VERSION=1.3.2
ARG ZLIB_SHA256=d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3
ARG LIBJPEG_TURBO_VERSION=3.1.4.1
ARG LIBJPEG_TURBO_SHA256=ecae8008e2cc9ade2f2c1bb9d5e6d4fb73e7c433866a056bd82980741571a022

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN curl --fail --location --retry 3 \
      "https://download.osgeo.org/libtiff/tiff-${LIBTIFF_VERSION}.tar.xz" \
      --output libtiff.tar.xz \
    && echo "${LIBTIFF_SHA256}  libtiff.tar.xz" | sha256sum --check --strict \
    && tar --extract --file libtiff.tar.xz \
    && mv "tiff-${LIBTIFF_VERSION}" libtiff \
    && rm libtiff.tar.xz \
    && curl --fail --location --retry 3 \
      "https://download.sourceforge.net/libpng/libpng-${LIBPNG_VERSION}.tar.xz" \
      --output libpng.tar.xz \
    && echo "${LIBPNG_SHA256}  libpng.tar.xz" | sha256sum --check --strict \
    && tar --extract --file libpng.tar.xz \
    && mv "libpng-${LIBPNG_VERSION}" libpng \
    && rm libpng.tar.xz \
    && curl --fail --location --retry 3 \
      "https://zlib.net/zlib-${ZLIB_VERSION}.tar.xz" \
      --output zlib.tar.xz \
    && echo "${ZLIB_SHA256}  zlib.tar.xz" | sha256sum --check --strict \
    && tar --extract --file zlib.tar.xz \
    && mv "zlib-${ZLIB_VERSION}" zlib \
    && rm zlib.tar.xz \
    && curl --fail --location --retry 3 \
      "https://github.com/libjpeg-turbo/libjpeg-turbo/releases/download/${LIBJPEG_TURBO_VERSION}/libjpeg-turbo-${LIBJPEG_TURBO_VERSION}.tar.gz" \
      --output libjpeg-turbo.tar.gz \
    && echo "${LIBJPEG_TURBO_SHA256}  libjpeg-turbo.tar.gz" | sha256sum --check --strict \
    && tar --extract --file libjpeg-turbo.tar.gz \
    && mv "libjpeg-turbo-${LIBJPEG_TURBO_VERSION}" libjpeg-turbo \
    && rm libjpeg-turbo.tar.gz

COPY build-libraries.sh /src/build-libraries.sh
RUN chmod +x /src/build-libraries.sh && /src/build-libraries.sh

COPY within_tiff.c /src/within_tiff.c
COPY build-module.sh /src/build-module.sh
RUN chmod +x /src/build-module.sh && /src/build-module.sh

FROM scratch AS artifact
COPY --from=build /out/ /
