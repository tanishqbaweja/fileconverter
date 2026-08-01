FROM emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b AS build

ARG XZ_VERSION=5.8.3
ARG XZ_SHA256=fff1ffcf2b0da84d308a14de513a1aa23d4e9aa3464d17e64b9714bfdd0bbfb6
ARG XZ_VARIANT=full

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl xz-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN curl --fail --location --retry 3 \
      "https://github.com/tukaani-project/xz/releases/download/v${XZ_VERSION}/xz-${XZ_VERSION}.tar.xz" \
      --output xz.tar.xz \
    && echo "${XZ_SHA256}  xz.tar.xz" | sha256sum --check --strict \
    && tar --extract --file xz.tar.xz \
    && mv "xz-${XZ_VERSION}" xz \
    && rm xz.tar.xz

COPY within_xz.c /src/within_xz.c
COPY build.sh /src/build.sh
RUN chmod +x /src/build.sh && XZ_VARIANT="${XZ_VARIANT}" /src/build.sh

FROM scratch AS artifact
COPY --from=build /out/ /
