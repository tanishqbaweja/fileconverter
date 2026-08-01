FROM emscripten/emsdk:6.0.4-x64@sha256:8b2291b45733cd26142d2ff21252d06b851f2e15ed8963143b5406850dbb7a3b AS build

ARG BZIP2_VERSION=1.0.8
ARG BZIP2_SHA256=ab5a03176ee106d3f0fa90e381da478ddae405918153cca248e682cd0c4a2269

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /src
RUN curl --fail --location --retry 3 \
      "https://sourceware.org/pub/bzip2/bzip2-${BZIP2_VERSION}.tar.gz" \
      --output bzip2.tar.gz \
    && echo "${BZIP2_SHA256}  bzip2.tar.gz" | sha256sum --check --strict \
    && tar --extract --file bzip2.tar.gz \
    && mv "bzip2-${BZIP2_VERSION}" bzip2 \
    && rm bzip2.tar.gz

COPY within_bzip2.c /src/within_bzip2.c
COPY build.sh /src/build.sh
RUN chmod +x /src/build.sh && /src/build.sh

FROM scratch AS artifact
COPY --from=build /out/ /
