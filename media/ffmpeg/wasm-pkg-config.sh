#!/usr/bin/env bash
set -euo pipefail

export PKG_CONFIG_LIBDIR=/src/install/lib/pkgconfig
export PKG_CONFIG_PATH=
exec /usr/bin/pkg-config "$@"
