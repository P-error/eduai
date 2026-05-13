#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-browser-live-user-journey-pilot"

rm -rf "$TMP_DIR"

mapfile -t TS_SOURCES < <(
  find src scripts \
    -name '*.ts' \
    ! -name '*.d.ts' \
    | sort
)

npx tsc \
  --noCheck \
  --module commonjs \
  --target es2020 \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck \
  --rootDir . \
  --outDir "$TMP_DIR" \
  "${TS_SOURCES[@]}"

mkdir -p "$TMP_DIR/node_modules"
ln -sfn "$TMP_DIR/src" "$TMP_DIR/node_modules/@"

NODE_PATH="${PWD}/node_modules:${TMP_DIR}/node_modules" \
node "$TMP_DIR/scripts/browser-live-user-journey-pilot.js" "$@"
