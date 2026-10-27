#!/usr/bin/env bash
set -euo pipefail
TASK_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
[[ "$(uname -s)" == Linux ]] || { printf 'Linux-only private resolver\n' >&2; exit 1; }
[[ "${GITHUB_RUN_ID:-}" =~ ^[0-9]+$ ]] || { printf 'Numeric owned Actions run required\n' >&2; exit 1; }
for task_command in rustup curl git node sha256sum mktemp stat df awk realpath; do command -v "$task_command" >/dev/null; done
mkdir -p "$TASK_ROOT/work" "$TASK_ROOT/outputs/reports"
[[ "$(realpath "$TASK_ROOT/work")" == "$TASK_ROOT/work" ]]
[[ "$(realpath "$TASK_ROOT/outputs/reports")" == "$TASK_ROOT/outputs/reports" ]]
task_free_kib="$(df -Pk "$TASK_ROOT/work" | awk 'NR == 2 {print $4}')"
[[ "$task_free_kib" =~ ^[0-9]+$ ]] && (( task_free_kib >= 4194304 ))
task_scratch="$(mktemp -d "$TASK_ROOT/work/resvg-source-lock-XXXXXX")"
task_identity="$(stat -c '%d:%i' "$task_scratch")"
task_output="$TASK_ROOT/outputs/reports/resvg-source-lock-$GITHUB_RUN_ID"
task_cleanup() {
  local task_status=$?
  [[ "$(dirname "$task_scratch")" == "$TASK_ROOT/work" && ! -L "$task_scratch" ]]
  [[ "$(stat -c '%d:%i' "$task_scratch")" == "$task_identity" ]]
  [[ "$(realpath "$task_scratch")" == "$task_scratch" ]]
  rm -rf -- "$task_scratch"
  exit "$task_status"
}
trap task_cleanup EXIT
[[ ! -e "$task_output" && ! -L "$task_output" ]]
mkdir "$task_output" "$task_scratch/tmp"
export CARGO_HOME="$task_scratch/cargo" RUSTUP_HOME="$task_scratch/rustup"
export TMPDIR="$task_scratch/tmp" TMP="$task_scratch/tmp" TEMP="$task_scratch/tmp"
export RUSTUP_TOOLCHAIN=1.90.0 CARGO_NET_GIT_FETCH_WITH_CLI=true
export CARGO_RESOLVER_INCOMPATIBLE_RUST_VERSIONS=fallback
curl --fail --location --retry 2 --max-time 60 \
  https://static.rust-lang.org/dist/channel-rust-1.90.0.toml -o "$task_scratch/rust-manifest.toml"
printf '489c19f20d331765ab2835661eb546de90f6446a107a8db83045e7371e45cae2  %s\n' \
  "$task_scratch/rust-manifest.toml" | sha256sum --check --strict
rustup toolchain install 1.90.0 --profile minimal
git clone --filter=blob:none --no-checkout https://github.com/thx/resvg-js.git "$task_scratch/source"
git -C "$task_scratch/source" checkout 9ca058462ac529120c8cc84ddcd6fef644cc5406
[[ "$(git -C "$task_scratch/source" rev-parse HEAD)" == 9ca058462ac529120c8cc84ddcd6fef644cc5406 ]]
[[ ! -e "$task_scratch/source/Cargo.lock" ]]
node "$TASK_ROOT/images/resvg-source/resolve-lock.mjs" prepare "$task_scratch" "$task_output"
rustup run 1.90.0 cargo --version > "$task_scratch/cargo-version.txt"
grep -Eq '^cargo 1\.90\.0 ' "$task_scratch/cargo-version.txt"
(
  cd "$task_scratch/source"
  rustup run 1.90.0 cargo generate-lockfile
  rustup run 1.90.0 cargo metadata --locked --no-deps --format-version 1 > "$task_scratch/metadata.json"
)
node "$TASK_ROOT/images/resvg-source/resolve-lock.mjs" record "$task_scratch" "$task_output"
git -C "$TASK_ROOT" diff --exit-code -- public/engines
