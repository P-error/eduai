#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-training-dataset-self-check"

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
  $(find src -name '*.ts' -print)

mkdir -p "$TMP_DIR/node_modules"
ln -sfn "$TMP_DIR" "$TMP_DIR/node_modules/@"

NODE_PATH="${PWD}/node_modules:${TMP_DIR}/node_modules" \
CHECK_MODULE="$TMP_DIR/lib/training-dataset-self-check.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { runTrainingDatasetSelfCheck } = require(modulePath);
  Promise.resolve(runTrainingDatasetSelfCheck()).then((result) => {
    if (!result || result.ok !== true) {
      throw new Error("training dataset self-check failed");
    }
    console.log(JSON.stringify(result));
    process.exit(0);
  }).catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
'
