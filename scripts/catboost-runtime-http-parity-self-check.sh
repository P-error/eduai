#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-catboost-runtime-http-parity-self-check"

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
  src/lib/ml-six-factor-artifact-loader.ts \
  src/lib/ml-six-factor-catboost-python-scorer.ts \
  src/lib/ml-six-factor-catboost-http-parity-self-check.ts

mkdir -p "$TMP_DIR/node_modules"
ln -sfn "$TMP_DIR" "$TMP_DIR/node_modules/@"

NODE_PATH="${PWD}/node_modules:${TMP_DIR}/node_modules" \
CHECK_MODULE="$TMP_DIR/lib/ml-six-factor-catboost-http-parity-self-check.js" node -e '
  (async () => {
    const modulePath = process.env.CHECK_MODULE;
    if (!modulePath) throw new Error("missing CHECK_MODULE");
    const { runMlSixFactorCatBoostHttpParitySelfCheck } = require(modulePath);
    const result = await runMlSixFactorCatBoostHttpParitySelfCheck();
    if (!result || result.ok !== true) {
      throw new Error("catboost HTTP runtime parity self-check failed");
    }
    console.log(JSON.stringify(result, null, 2));
  })().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
'
