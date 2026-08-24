FROM emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b AS build

ARG LIBJXL_VERSION=0.12.0
ARG LIBJXL_COMMIT=a7a9c787341cf703dede03c2009fa460cae5e5df

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN git clone --filter=blob:none --no-checkout https://github.com/libjxl/libjxl.git libjxl \
    && cd libjxl \
    && git checkout "${LIBJXL_COMMIT}" \
    && test "$(git rev-parse HEAD)" = "${LIBJXL_COMMIT}" \
    && git submodule update --init --depth 1 --recommend-shallow \
      third_party/brotli third_party/highway third_party/libpng third_party/skcms

COPY CMakeLists.txt /src/wrapper/CMakeLists.txt
COPY within_jxl_encode.c /src/wrapper/within_jxl_encode.c
COPY build-module.sh /src/build-module.sh
RUN --mount=type=cache,id=within-jxl-encoder-build,target=/src/build,sharing=locked \
    chmod +x /src/build-module.sh && /src/build-module.sh

FROM scratch AS artifact
COPY --from=build /out/ /
