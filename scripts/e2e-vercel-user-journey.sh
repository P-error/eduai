#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-e2e-vercel-user-journey"

rm -rf "$TMP_DIR"

npx tsc \
  --noCheck \
  --module commonjs \
  --target es2022 \
  --lib es2022,dom \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck \
  --rootDir . \
  --outDir "$TMP_DIR" \
  scripts/e2e-vercel-user-journey.ts

node "$TMP_DIR/scripts/e2e-vercel-user-journey.js" "$@"
