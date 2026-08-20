FROM emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b AS build

ARG LIBJXL_VERSION=0.12.0
ARG LIBJXL_COMMIT=a7a9c787341cf703dede03c2009fa460cae5e5df
ARG LIBPNG_VERSION=1.6.58
ARG LIBPNG_SHA256=28eb403f51f0f7405249132cecfe82ea5c0ef97f1b32c5a65828814ae0d34775
ARG ZLIB_VERSION=1.3.2
ARG ZLIB_SHA256=d7a0654783a4da529d1bb793b7ad9c3318020af77667bcae35f95d0e42a792f3

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl git xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --filter=blob:none --no-checkout https://github.com/libjxl/libjxl.git libjxl \
    && cd libjxl \
    && git checkout "${LIBJXL_COMMIT}" \
    && test "$(git rev-parse HEAD)" = "${LIBJXL_COMMIT}" \
    && git submodule update --init --depth 1 --recommend-shallow \
      third_party/brotli third_party/highway third_party/libpng third_party/skcms \
    && curl --fail --location --retry 3 \
      "https://download.sourceforge.net/libpng/libpng-${LIBPNG_VERSION}.tar.xz" \
      --output /src/libpng.tar.xz \
    && echo "${LIBPNG_SHA256}  /src/libpng.tar.xz" | sha256sum --check --strict \
    && tar --extract --file /src/libpng.tar.xz --directory /src \
    && mv "/src/libpng-${LIBPNG_VERSION}" /src/libpng \
    && rm /src/libpng.tar.xz \
    && curl --fail --location --retry 3 \
      "https://zlib.net/zlib-${ZLIB_VERSION}.tar.xz" \
      --output /src/zlib.tar.xz \
    && echo "${ZLIB_SHA256}  /src/zlib.tar.xz" | sha256sum --check --strict \
    && tar --extract --file /src/zlib.tar.xz --directory /src \
    && mv "/src/zlib-${ZLIB_VERSION}" /src/zlib \
    && rm /src/zlib.tar.xz

COPY CMakeLists.libraries.txt /src/library-build/CMakeLists.txt
COPY build-libraries.sh /src/build-libraries.sh
RUN chmod +x /src/build-libraries.sh && /src/build-libraries.sh

COPY CMakeLists.txt /src/wrapper/CMakeLists.txt
COPY within_jxl.c /src/wrapper/within_jxl.c
COPY build-module.sh /src/build-module.sh
RUN chmod +x /src/build-module.sh && /src/build-module.sh

FROM scratch AS artifact
COPY --from=build /out/ /
