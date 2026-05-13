#!/usr/bin/env bash
set -euo pipefail

TMP_DIR="${TMPDIR:-/tmp}/eduai-dataset-export-self-check"

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
  src/lib/*.ts

mkdir -p "$TMP_DIR/node_modules/@"
ln -sfn "$TMP_DIR/lib" "$TMP_DIR/node_modules/@/lib"

CHECK_MODULE="$TMP_DIR/lib/dataset-export.js" node -e '
  const modulePath = process.env.CHECK_MODULE;
  if (!modulePath) throw new Error("missing CHECK_MODULE");
  const { runDatasetExportSyntheticSelfCheck } = require(modulePath);
  const result = runDatasetExportSyntheticSelfCheck();
  if (!result || result.ok !== true) {
    throw new Error("dataset export self-check failed");
  }
  console.log(JSON.stringify(result));
'
