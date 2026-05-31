#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-catboost-runtime-parity-self-check"

rm -rf "$TMP_DIR"

npx tsc \
  --noCheck \
  --module commonjs \
  --target es2020 \
  --moduleResolution node \
  --esModuleInterop \
  --skipLibCheck \
  --rootDir src \
  --outDir "$TMP_DIR" \
  src/lib/research-policy-registry.ts \
  src/lib/ml-six-factor-artifact-loader.ts \
  src/lib/ml-six-factor-catboost-python-scorer.ts \
  src/lib/ml-six-factor-catboost-runtime-parity-self-check.ts

mkdir -p "$TMP_DIR/node_modules"
ln -sfn "$TMP_DIR" "$TMP_DIR/node_modules/@"

NODE_PATH="${PWD}/node_modules:${TMP_DIR}/node_modules" \
CHECK_MODULE="$TMP_DIR/lib/ml-six-factor-catboost-runtime-parity-self-check.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { runMlSixFactorCatBoostRuntimeParitySelfCheck } = require(modulePath);
  const result = runMlSixFactorCatBoostRuntimeParitySelfCheck();
  if (!result || result.ok !== true) {
    throw new Error("catboost runtime parity self-check failed");
  }
  console.log(JSON.stringify(result, null, 2));
'
