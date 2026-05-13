#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-real-user-training-observation-export"

rm -rf "$TMP_DIR"

npx tsc \
  --noCheck \
  --module commonjs \
  --target es2020 \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck \
  --rootDir . \
  --outDir "$TMP_DIR" \
  scripts/export-real-user-training-observations.ts \
  src/lib/ml-six-factor-policy-contract.ts \
  src/lib/ml-six-factor-feature-builder.ts \
  src/lib/ml-six-factor-shadow.ts \
  src/lib/ml-six-factor-decision-metadata.ts \
  src/lib/ml-six-factor-outcome-linking.ts \
  src/lib/ml-six-factor-training-observation.ts \
  src/lib/ml-six-factor-real-user-export.ts

mkdir -p "$TMP_DIR/node_modules"
ln -sfn "$TMP_DIR/src" "$TMP_DIR/node_modules/@"

NODE_PATH="${PWD}/node_modules:${TMP_DIR}/node_modules" \
node "$TMP_DIR/scripts/export-real-user-training-observations.js" "$@"
